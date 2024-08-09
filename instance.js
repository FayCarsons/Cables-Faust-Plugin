'use strict'

// Hacky enum
const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic',
}

const FAUST_ERROR = "FaustError"

class Faust {
  constructor(PortHandler) {
    this.update = this.update.bind(this)
    this.audioCtx = CABLES.WEBAUDIO.createAudioContext(op)
    this.voicesPort = op.inInt('Voices', 1)
    this.factoryPort = op.inObject('Factory')
    this.audioOut = op.outObject('Audio Out')

    this.voicing = Voicing.Mono
    this.voices = 1
    this.node = null

    this.factoryPort.onChange = this.update
    this.voicesPort.onChange = this.update

    this.voicesPort.setUiAttribs({
      greyout: () => this.voicing == Voicing.Poly,
    })

    this.portHandler = new PortHandler(this.getContext())
  }

  getContext() {
    return {
      op,
      Voicing,
      voiceMode: this.voicing,
    }
  }

  async update() {
    try {
      const generator = this.factoryPort.get()
      if (generator) {
        const internalFactory = generator.factory ?? generator.voiceFactory

        if (!internalFactory)
          throw new Error('Internal error - generator does not contain internal factory field')
        else
          this.voicing = internalFactory.poly ? Voicing.Poly : Voicing.Mono

        this.voices = this.voicesPort.get() ?? this.voices
        this.node = await generator.createNode(this.audioCtx, this.voices)
        this.portHandler.update(this.node, this.getContext())

        this.audioOut.setRef(this.node)
        op.setUiError('FaustError', null)
      }
    } catch (err) {
      op.setUiError('FaustError', `cannot create Faust instance: ${err}`)
      this.node = null
      this.audioOut.setRef(null)
    }
  }
}

async function builder() {
  const portHandlerModuleText = attachments['porthandler']

  if (!portHandlerModuleText) {
    op.setUiError(FAUST_ERROR, "Internal error - cannot import \'porthandler\' module, has it been removed from attachmments?")
  }

  const blob = new Blob([portHandlerModuleText], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)

  try {
    const { PortHandler: PortHandlerClassDefinition } = await import(url)
    const faust = new Faust(PortHandlerClassDefinition)
    faust.update()
  } catch (err) {
    op.setUiError('FaustError', `Error importing module: ${err}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

builder()

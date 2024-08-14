'use strict'

// Hacky enum
const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic',
}

const FAUST_ERROR = "FaustError"

const voicesPort = op.inInt('Voices', 1)
const contextPort = op.inObject('Context')
const audioOut = op.outObject('Audio Out')

class Faust {
  constructor(PortHandler) {
    // We have to bind `this` to `update` to ensure `this` refers to the object 
    // and not the enclosing promise
    this.update = this.update.bind(this)

    this.audioCtx = CABLES.WEBAUDIO.createAudioContext(op)

    this.voicing = Voicing.Mono
    this.voices = 1
    this.node = null

    contextPort.onChange = this.update
    voicesPort.onChange = this.update

    voicesPort.setUiAttribs({
      greyout: () => this.voicing !== Voicing.Poly,
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
      const context = contextPort.get()
      if (context && context.generator) {
        const { voicing, generator } = contextPort.get()
        this.voicing = voicing
        this.voices = voicesPort.get() ?? this.voices

        // Before updating the node, try to disconnect it from any nodes it may 
        // be connected to. This will fail if it is not connected, which is 
        // fine so we ignore the exception
        if (this.node)
          try {
            this.node.disconnect()
            this.node.destroy()
          } catch (_) { }

        this.node = await generator.createNode(this.audioCtx, this.voices)
        this.portHandler.update(this.node, this.getContext())

        audioOut.setRef(this.node)
        op.setUiError('FaustError', null)
      }
    } catch (err) {
      op.setUiError('FaustError', `cannot create Faust instance: ${err}`)
      if (this.node)
        this.node.destroy()
      this.node = null
      audioOut.setRef(null)
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
    return faust
  } catch (err) {
    op.setUiError('FaustError', `Error importing module: ${err}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const faust = builder()

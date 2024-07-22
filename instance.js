'use strict'

const faustInstance = {},
  audioCtx = CABLES.WEBAUDIO.createAudioContext(op),
  Voicing = {
    Mono: 'Monophonic',
    Poly: 'Polyphonic',
  },
  voicesPort = op.inInt('Voices', 1),
  factoryPort = op.inObject('Factory'),
  audioOut = op.outObject('Audio Out')

let voicing = Voicing.Mono,
  voices = 1,
  node = null,
  portHandler = null

async function loadPortHandler() {
  const { PortHandler } = await importModule('porthandler')
  portHandler = new PortHandler(createContext())
}
loadPortHandler()

factoryPort.onChange = update
voicesPort.onChange = update

voicesPort.setUiAttribs({
  greyout: () => faustInstance.voicing == Voicing.Mono,
})

function createContext() {
  return {
    op,
    Voicing: Voicing.Mono,
    voiceMode: faustInstance.voicing,
  }
}

// exponential backoff params
let attempts = 0,
  backoff = 50
const exponent = 2

function exponentialBackoff() {
  if (attempts > 5) throw new Error('Cannot load portHandler module')
  attempts += 1
  backoff *= exponent
  setTimeout(update, backoff)
}

async function update() {
  // If portHandler is null it probably just hasn't loaded
  // Do exponential backoff
  if (!portHandler) {
    exponentialBackoff()
  }

  try {
    const generator = factoryPort.get()
    if (generator) {
      const internalFactory = generator.factory ?? generator.voiceFactory
      if (!internalFactory)
        throw new Error('Generator does not contain internal factory field')
      else {
        voicing = internalFactory.poly ? Voicing.Poly : Voicing.Mono
      }
      if (node) {
        node.disconnect()
      }
      voices = voicesPort.get() ?? voices
      node = await generator.createNode(audioCtx, voices)
      portHandler.update(node, createContext())

      node.connect(audioCtx.destination)
      audioOut.setRef(node)
      op.setUiError('FaustError', null)
    }
  } catch (err) {
    op.setUiError('FaustError', `cannot create Faust instance: ${err}`)
    node = null
    audioOut.setRef(null)
  }
}

async function importModule(name) {
  const attachment = attachments[name]
  if (!attachment) {
    throw new Error(`Module ${name} is null`)
  }
  const blob = new Blob([attachment], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    return await import(url)
  } catch (err) {
    op.setUiError('FaustError', `Error importing module: ${err}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

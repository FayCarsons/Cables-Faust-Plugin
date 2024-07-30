'use strict'

console.clear()

// TODO : rewrite this and `main.js` to have individual variables, as opposed
// to being contained in an object which offers no benefit and is verbose

// Terminology
// Operator (op) -> the Cables.gl patch object that runs this program
// Port -> an input/output port on the operator
// Node -> a Web Audio node

const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
// Can be used monophonically or polyphonically
freq = hslider("freq", 440, 10, 10000, 1);
gate = button("gate");

process = gate : ba.impulsify : fi.resonbp(freq, 100, 1.1) : ma.tanh;`

const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic',
}

const factory = {}

factory.code = DEFAULT_SCRIPT
factory.voicing = Voicing.Mono
factory.codePort = op.inStringEditor('Code', DEFAULT_SCRIPT)
factory.voicingPort = op.inSwitch(
  'Mode',
  [Voicing.Mono, Voicing.Poly],
  Voicing.Mono,
)
factory.codePort.onChange = updateParam('code', factory.codePort)
factory.voicingPort.onChange = updateParam('voicing', factory.voicingPort)
factory.outPort = op.outObject('Factory')

function updateParam(name, port) {
  return () => {
    const current_value = port.get()
    if (current_value && current_value != factory[name]) {
      factory[name] = current_value
      update()
    }
  }
}

// Initialize Faust object with 'faustwasm' library and PortHandler module
async function initialize() {
  if (factory.module) return
  // Get FaustWasm module
  const {
    instantiateFaustModule,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = await importModule('faustwasm')

  try {
    // Create compiler
    const module = await instantiateFaustModule()
    const libFaust = new LibFaust(module)
    const compiler = new FaustCompiler(libFaust)

    // Set faust module field so that compiler etc are available everywhere
    factory.module = {
      compiler: compiler,
      FaustWasmInstantiator: FaustWasmInstantiator,
      FaustMonoDspGenerator: FaustMonoDspGenerator,
      FaustPolyDspGenerator: FaustPolyDspGenerator,
      FaustMonoWebAudioDsp: FaustMonoWebAudioDsp,
    }

    await update()
  } catch (err) {
    console.error(err)
    op.setUiError('FaustError', `Cannot initialize FaustFactory: ${err}`)
  }
}

// Recompile, update ports,
async function update() {
  // If the Faust module hasnot been imported then we cannot continue
  if (!factory.module) {
    console.error('Faust module is undefined or null')
    return
  }

  // Get the dependencies for this function
  const { FaustMonoDspGenerator, FaustPolyDspGenerator, compiler } =
    factory.module

  try {
    console.log(`Factory Voicing is: ${factory.voicing}`)
    // Create the 'generator' and compile
    const generator =
      Voicing.Mono == factory.voicing
        ? new FaustMonoDspGenerator()
        : new FaustPolyDspGenerator()
    await generator.compile(compiler, 'dsp', factory.code, '')

    factory.outPort.set(generator)
    op.setUiError('FaustError', null)
  } catch (err) {
    op.setUiError('FaustError', `Error compiling script: ${err}`)
    console.error(err)
  }
}

// Grabs attachment as blob, attaches a URL, then imports that URL as a
// Javascript module
async function importModule(name) {
  const attachment = attachments[name]
  if (!attachment) console.error('Cannot import NULL module')
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

initialize()

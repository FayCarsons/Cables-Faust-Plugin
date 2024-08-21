'use strict'
console.clear()

// Terminology
// Operator (op) -> the Cables.gl patch object that runs this program
// Port -> an input/output port on the operator
// Node -> a Web Audio node

const DEFAULT_SCRIPT = `import("stdfaust.lib");

N = 8;

oscillator(index, frequency, detune) = os.sawtooth(frequency + index*detune);
drone(oscillator_count, frequency, detune) = par(i, oscillator_count, oscillator(i, frequency, detune));

frequency = hslider("frequency", 55, 20, 20000, 1);
detune = hslider("detune", 0.1, -10, 10, 0.01);

process = drone(N, frequency, detune) :> /(N);`

// Hacky enum, allows for comparison by reference vs deep equality which would
// be more expensive
const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic',
}

const FAUST_ERROR = 'FaustError'

const codePort = op.inStringEditor('Code', DEFAULT_SCRIPT)
const voicingPort = op.inSwitch(
  'Mode',
  [Voicing.Mono, Voicing.Poly],
  Voicing.Mono,
)
const outPort = op.outObject('Context')

class FaustContext {
  constructor(faustModule) {
    this.update = this.update.bind(this)

    this.code = DEFAULT_SCRIPT
    this.voicing = Voicing.Mono
    codePort.onChange = this.update
    voicingPort.onChange = this.update
    this.faustModule = faustModule
  }

  async update() {
    // If the Faust module hasnot been imported then we cannot continue
    if (!this.faustModule) {
      console.error('Faust module is undefined or null')
      return
    }

    // Get the dependencies for this function
    const { FaustMonoDspGenerator, FaustPolyDspGenerator, compiler } =
      this.faustModule

    try {
      this.code = codePort.get() ?? this.code
      this.voicing = voicingPort.get() ?? this.voicing
      // Create the 'generator' and compile
      const generator =
        this.voicing == Voicing.Mono
          ? new FaustMonoDspGenerator()
          : new FaustPolyDspGenerator()

      await generator.compile(compiler, 'dsp', this.code, '')

      outPort.set({ voicing: this.voicing, generator })
      op.setUiError(FAUST_ERROR, null)
    } catch (err) {
      op.setUiError(FAUST_ERROR, `Error compiling script: ${err}`)
      console.error(err)
    }
  }
}

async function build() {
  const text = attachments['faustwasm']
  if (!text)
    op.setUiError(
      'FaustError',
      "module 'faustwasm' cannot be found, has it been removed from attachments?",
    )
  const blob = new Blob([text], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)

  try {
    // Get FaustWasm module
    const {
      instantiateFaustModule,
      LibFaust,
      FaustWasmInstantiator,
      FaustMonoDspGenerator,
      FaustPolyDspGenerator,
      FaustCompiler,
    } = await import(url)

    // Create compiler
    const faustModule = await instantiateFaustModule()
    const libFaust = new LibFaust(faustModule)
    const compiler = new FaustCompiler(libFaust)

    const faust = new FaustContext({
      compiler: compiler,
      FaustWasmInstantiator: FaustWasmInstantiator,
      FaustMonoDspGenerator: FaustMonoDspGenerator,
      FaustPolyDspGenerator: FaustPolyDspGenerator,
    })

    faust.update()
  } catch (err) {
    op.setUiError(FAUST_ERROR, `Error importing module: ${err}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

build()

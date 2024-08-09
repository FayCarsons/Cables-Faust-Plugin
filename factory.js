'use strict'
console.clear()

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

// Hacky enum, allows for comparison by reference vs deep equality which would be more expensive
const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic',
}

const FAUST_ERROR = "FaustError"

class FaustContext {
  constructor(faustModule) {
    this.update = this.update.bind(this)
    this.codePort = op.inStringEditor('Code', DEFAULT_SCRIPT)
    this.voicingPort = op.inSwitch(
      'Mode',
      [Voicing.Mono, Voicing.Poly],
      Voicing.Mono,
    )
    this.outPort = op.outObject('Factory')

    this.code = DEFAULT_SCRIPT
    this.voicing = Voicing.Mono
    this.codePort.onChange = this.updateParam('code', this.codePort)
    this.voicingPort.onChange = this.updateParam('voicing', this.voicingPort)
    this.faustModule = faustModule
  }

  // Check that param has actually changed before recompiling
  updateParam(name, port) {
    return () => {
      const currentValue = port.get()
      if (currentValue && currentValue !== this[name]) {
        this[name] = currentValue
        this.update()
      }
    }
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
      console.log(`FaustContext Voicing is: ${this.voicing}`)
      // Create the 'generator' and compile
      const generator =
        Voicing.Mono == this.voicing
          ? new FaustMonoDspGenerator()
          : new FaustPolyDspGenerator()
      await generator.compile(compiler, 'dsp', this.code, '')

      this.outPort.set(generator)
      op.setUiError(FAUST_ERROR, null)
    } catch (err) {
      op.setUiError(FAUST_ERROR, `Error compiling script: ${err}`)
      console.error(err)
    }
  }
}

// async constructors are not allowed so we use this builder class to first 
// ensure that the necessary modules have been imported before constructing our
// main class
class Builder {
  async importFaustModule() {
    {

      const text = attachments['faustwasm']
      if (!text) op.setUiError("FaustError", "module \'faustwasm\' cannot be found, has it been removed from attachments?")
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

        return {
          compiler: compiler,
          FaustWasmInstantiator: FaustWasmInstantiator,
          FaustMonoDspGenerator: FaustMonoDspGenerator,
          FaustPolyDspGenerator: FaustPolyDspGenerator,
        }
      } catch (err) {
        op.setUiError(FAUST_ERROR, `Error importing module: ${err}`)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  }

  static async build() {
    const faustModule = await this.importFaustModule()
    return new FaustContext(faustModule)
  }
}

// Create the Faust Context object and start it
Builder.build().update()

console.clear()

// Terminology
// Operator (op) -> the Cables.gl patch object that runs this program
// Port -> an input/output port on the operator
// Node -> a Web Audio node

// TODO: add `isDirty: bool` field for each param in Faust class to minimize unnecessary
// recompilation 
const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
freq = hslider("freq", 440, 10, 10000, 1);
gate = button("gate");

process = gate : ba.impulsify : fi.resonbp(freq, 100, 1.1) : ma.tanh;`

class Faust {
  constructor() {
    this.Voicing = {
      Mono: 'Monophonic',
      Poly: 'Polyphonic',
    }

    this.audioCtx = CABLES.WEBAUDIO.createAudioContext(op)
    this.audioOut = op.outObject('Audio Out')

    this.staticPorts = {
      voiceMode: op.inSwitch('Mode', [this.Voicing.Mono, this.Voicing.Poly], this.Voicing.Mono),
      numVoices: op.inInt('Voices', 1),
      code: op.inStringEditor('Code', DEFAULT_SCRIPT),
    }

    this.staticPorts.numVoices.setUiAttribs({
      greyout: () => this.voiceMode != this.Voicing.Poly,
    })


    // Add callbacks to static ports, where values are checked in 'updateParam' to
    // prevent unnecessary updates
    for (const name of Object.keys(this.staticPorts))
      this.staticPorts[name].onChange = () => {
        const val = this.staticPorts[name].get()
        if (this[name] === val) return
        else {
          this[name] = val
          this.update()
        }
      }
    this.voiceMode = this.staticPorts.voiceMode.get() ?? this.Voicing.Mono
    this.numVoices = this.staticPorts.numVoices.get() ?? 1
    this.code = this.staticPorts.code.get() ?? DEFAULT_SCRIPT
    this.initialize()
  }

  get context() {
    return {
      op,
      Voicing: this.Voicing,
      voiceMode: this.voiceMode
    }
  }


  initialize = async () => {
    if (this.faustModule) return
    // Get FaustWasm module
    const {
      instantiateFaustModule,
      LibFaust,
      FaustWasmInstantiator,
      FaustMonoDspGenerator,
      FaustPolyDspGenerator,
      FaustMonoWebAudioDsp,
      FaustCompiler,
    } = await this.importModule('faustwasm')

    // Import PortHandler module and instantiate handler
    const { PortHandler } = await this.importModule('porthandler')
    this.portHandler = new PortHandler(this.context)

    try {
      // Create compiler
      const module = await instantiateFaustModule()
      const libFaust = new LibFaust(module)
      const compiler = new FaustCompiler(libFaust)

      // Set faust module field so that compiler etc are available everywhere
      this.faustModule = {
        compiler: compiler,
        FaustWasmInstantiator: FaustWasmInstantiator,
        FaustMonoDspGenerator: FaustMonoDspGenerator,
        FaustPolyDspGenerator: FaustPolyDspGenerator,
        FaustMonoWebAudioDsp: FaustMonoWebAudioDsp,
      }

      await update()
    } catch (err) {
      console.error(err)
      op.setUiError('FaustError', `Cannot initialize FaustHandler: ${err}`)
    }
  }

  update = async () => {
    if (!this.faustModule) {
      console.error('Faust module is undefined or null')
      return
    }

    // Get the dependencies for this function
    const { FaustMonoDspGenerator, FaustPolyDspGenerator, compiler } = this.faustModule

    try {
      // Create the 'generator' and compile
      const generator =
        this.Voicing.Mono == this.voiceMode
          ? new FaustMonoDspGenerator()
          : new FaustPolyDspGenerator()
      await generator.compile(compiler, 'dsp', this.code, '')

      // If node is not null then we are updating a node that has already been iniialized and
      // may potentially need to disconnect it
      if (this.node)
        try {
          this.node.disconnect()
        } catch (_) {
          // If the node is not connected, that is O.K.
        }

      this.node = await generator.createNode(this.audioCtx, this.numVoices)
      this.portHandler.update(this.node, this.context)
      console.log(this.portHandler)

      this.node.connect(this.audioCtx.destination)
      this.audioOut.setRef(this.node)
    } catch (err) {
      op.setUiError('FaustError', `Error compiling script: ${err}`)
      console.error(err)
      if (this.node)
        try {
          this.node.disconnect()
        } catch (_) { }
      this.node = null
      this.audioOut.set(null)
    } finally {
      if (this.node) op.setUiError('FaustError', null)
    }
  }

  importModule = async (name) => {
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

}

new Faust()

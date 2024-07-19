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

// A static object with all Voicing values (strings) that can be referenced
// elsewhere, preventing mispellings, excessive string comparison,
// other illegal states
const Voicing = {
  Mono: "Monophonic",
  Poly: "Polyphonic"
}

// The object that holds the operator's state
const faust = {}

function hasMidi(node) {
  const metadata = node.getMeta().meta
  // Options is generally near the end of the metadata array, so start from there
  if (metadata)
    for (let i = metadata.length - 1; i > 0; --i) {
      const options = metadata[i].options
      if (options) {
        return options.trim().includes("[midi:on]")
      }
    }

  return false
}

function updateParam(name, port) {
  return () => {
    console.log(`Updating ${name}`)
    const val = port.get()
    if (faust[name] === val) return
    faust[name] = val
    update()
  }
}

// Initialize faust object state
function create() {
  // Static audio fields
  faust.audioCtx = CABLES.WEBAUDIO.createAudioContext(op)
  faust.audioOut = op.outObject("Audio out")

  faust.staticPorts = {
    voiceMode: op.inSwitch("Mode", [Voicing.Mono, Voicing.Poly], Voicing.Mono),
    numVoices: op.inInt("Voices", 1),
    code: op.inStringEditor("Code", DEFAULT_SCRIPT)
  }

  // TODO: add `IsDirty: bool` field for each param to minimize unnecessary
  // recompilation etc

  // Add callbacks to static ports, where values are checked in 'updateParam' to
  // prevent unnecessary updates
  for (const [name, port] of Object.entries(faust.staticPorts)) port.onChange = updateParam(name, port)
  faust.voiceMode = faust.staticPorts.voiceMode.get() ?? Voicing.Mono
  faust.numVoices = faust.staticPorts.numVoices.get() ?? 1
  faust.code = faust.staticPorts.code.get() ?? DEFAULT_SCRIPT
}

// Creates an object containing state that PortHandler needs
function createContext() {
  return {
    op,
    Voicing,
    voiceMode: faust.voiceMode,
  }
}

// Initialize Faust object with 'faustwasm' library and PortHandler module
async function initialize() {
  if (faust.mod) return;
  // Get FaustWasm module
  const {
    instantiateFaustModule,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = await importModule('faustwasm');

  // Import PortHandler module and instantiate handler
  const { PortHandler } = await importModule('porthandler')
  faust.portHandler = new PortHandler(createContext())

  try {
    // Create compiler
    const module = await instantiateFaustModule();
    const libFaust = new LibFaust(module);
    const compiler = new FaustCompiler(libFaust);

    // Set faust module field so that compiler etc are available everywhere
    faust.mod = {
      "compiler": compiler,
      "FaustWasmInstantiator": FaustWasmInstantiator,
      "FaustMonoDspGenerator": FaustMonoDspGenerator,
      "FaustPolyDspGenerator": FaustPolyDspGenerator,
      "FaustMonoWebAudioDsp": FaustMonoWebAudioDsp,
    };

    await update()
  } catch (err) {
    console.error(err)
    op.setUiError("FaustError", `Cannot initialize FaustHandler: ${err}`)
  }
}

// Recompile, update ports,
async function update() {
  // If the Faust module hasnot been imported then we cannot continue
  if (!faust.mod) {
    console.error("Faust module is undefined or null")
    return
  }

  // Get the dependencies for this function
  const {
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    compiler,
  } = faust.mod

  try {
    // Create the 'generator' and compile
    const generator = Voicing.Mono == faust.voiceMode ? new FaustMonoDspGenerator() : new FaustPolyDspGenerator()
    await generator.compile(compiler, "dsp", faust.code, "")

    // If node is not null then we are updating a node that has already been iniialized and 
    // may potentially need to disconnect it
    if (faust.node)
      try { faust.node.disconnect() }
      // If the node is not connected, that is O.K. 
      catch (_) { }

    faust.node = await generator.createNode(faust.audioCtx, faust.numVoices)
    faust.portHandler.update(faust.node)


    faust.node.connect(faust.audioCtx.destination)
    faust.audioOut.setRef(faust.node)
  } catch (err) {
    op.setUiError("FaustError", `Error compiling node: ${err}`)
    console.error(err)
    if (faust.node) try { faust.node.disconnect() } catch (_) { }
    faust.node = undefined
    faust.audioOut.set(null)
  } finally {
    if (faust.node)
      op.setUiError("FaustError", null)
  }
}

// Grabs attachment as blob, attaches a URL, then imports that URL as a
// Javascript module
async function importModule(name) {
  const attachment = attachments[name]
  if (!attachment) console.error("Cannot import NULL module")
  const blob = new Blob([attachment], { "type": "application/javascript" })
  const url = URL.createObjectURL(blob)
  try {
    return await import(url)
  } catch (err) {
    op.setUiError("FaustError", `Error importing module: ${err}`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

create()
initialize()

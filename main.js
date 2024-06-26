'use strict'
"esversion: 9";

// Clear console for easier debugging
console.clear();

const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
freq = hslider("freq", 440, 10, 10000, 1);
gate = button("gate");

process = gate : ba.impulsify : fi.resonbp(freq, 100, 1.1) : ma.tanh;`;

// The built in string editor where you write your Faust code 
// Shows up in the sidebar when you click on the Faust op, no need to create 
// an external op
const faustEditor = op.inStringEditor("Faust Code", DEFAULT_SCRIPT);

// 'enum'
const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic'
}

// Voicing mode
const voicing = op.inSwitch("Mode", [Voicing.Mono, Voicing.Poly], Voicing.Mono);
// Number of voices
const voices = op.inInt("Voices");

const audioOut = op.outObject("Audio out");

// Faustwasm objects and functions
let faustModule;
// The instantiated Web Audio node
let node;

// IO port handler
let portHandler;

// Web Audio context
const ctx = CABLES.WEBAUDIO.createAudioContext(op);

/// Handles switching between monophonic and polyphonic modes
/// @return {void}
voicing.onChange = async () => {
  if (!node) return

  const voicingVal = voicing.get();

  // If user clicks button for me we are currenttly using, return
  if (node && voicingVal === node.mode) return;
  else {
    // If node has been initialized, disconnect and free previous node before reinitializing
    if (node) node.disconnect();
    node = undefined;
    await compile()
  }
};

/// Handles changes in the number of voices 
/// @return {void}
voices.onChange = async () => {
  if (!node) return

  const numVoices = voices.get()

  // If value hasn't changed or is invalid, return
  if (numVoices === node.voices || numVoices < 1) return;
  else {
    // if node has been initialized, disconnect and free previous node before reinitializing
    if (node) node.disconnect();
    node = undefined
    await compile()
  }

}

/// Compiles Faust program, initializes node and IO
async function compile() {
  if (!faustModule) {
    console.error("FaustModule is undefined");
    return;
  }

  const {
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    compiler,
  } = faustModule;

  // Get Faust program
  const code = faustEditor.get();

  // Get voicing mode
  const voicingVal = voicing.get();

  try {
    // Create generator that compiles and instantiates Web Audio nodes
    let generator;

    if (Voicing.Mono == voicingVal) generator = new FaustMonoDspGenerator()
    else generator = new FaustPolyDspGenerator()

    await generator.compile(compiler, "dsp", code, "");

    // If node has been initialized, disconnect before reinitialization
    if (node) node.disconnect();
    node = await generator.createNode(ctx, voices.get());

    // Set voicing metadata
    node.mode = voicingVal;
    node.numVoices = voices.get()

    // Create IO ports and store references in portHandler
    portHandler.initControl(node)
    portHandler.initAudio(node)

    if (voicingVal == Voicing.Poly) {
      if (!portHandler.hasPolyParams())
        throw new Error(`Polyphonic scripts must have the following params:
          freq -> accepts MIDI notes 0-127
          gate -> accepts triggers
          gain -> *optional* accepts velocity
        `)
    }
    // Connect to audio context and set audio output
    node.connect(ctx.destination);
    audioOut.setRef(node);
  } catch (err) {
    op.setUiError("FaustError", `Error compiling node: ${err}`);
    node.disconnect();
    node = undefined;
    audioOut.set(null);
  } finally {
    op.setUiError("FaustError", null)
  }
}

// When Faust script changes, recompile
faustEditor.onChange = compile

/// imports module attachment, which is raw text, as a Javascript module
/// @return {Promise<Module>}
/// imports attachment, which is raw text, as a Javascript module
/// @return {Promise<Module>}
async function importModule(attachment) {
  if (!attachment) console.error("module attachment is NULL");
  const blob = new Blob([attachment], { "type": "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const module = await import(url);
    return module;
  }
  catch (err) {
    op.setUIError("FaustError", `Error importing module: ${err}`);
  }
  finally {
    URL.revokeObjectURL(url);
  }
}

op.init = async () => {
  // Get FaustWasm module
  const {
    instantiateFaustModule,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = await importModule(attachments.faustwasm);

  const { PortHandler } = await importModule(attachments.porthandler)
  portHandler = new PortHandler(op, Voicing)

  try {
    // Create compiler
    const module = await instantiateFaustModule();
    const libFaust = new LibFaust(module);
    const compiler = new FaustCompiler(libFaust);

    // Set global object faustModule so that compiler etc are available everywhere
    faustModule = {
      "compiler": compiler,
      "FaustWasmInstantiator": FaustWasmInstantiator,
      "FaustMonoDspGenerator": FaustMonoDspGenerator,
      "FaustPolyDspGenerator": FaustPolyDspGenerator,
      "FaustMonoWebAudioDsp": FaustMonoWebAudioDsp,
    };

    // Compile current script
    await compile();
  }
  catch (err) {
    op.setUiError("FaustError", `Cannot fetch LibFaust: ${err}`);
  }
};

'use strict'

// JS enum trick, restricts strings determining voicing behavior to two values
const Voicing = {
  Mono: 'Monophonic',
  Poly: 'Polyphonic',
}

class PortHandler {
  constructor() {
    // parameter 'address' (I.E. '/dsp/freq') -> input port pairs
    this.control = {}

    // audio input ports
    this.audio = []

    // NOTE: Currently, I don't see a need for output handling for audio rate outputs
    // We're outputting a single Web Audio Node for audio out, it can have multipl channels 
    // if desired and those channels can be handled elsehwere in the patch
    // What needs to be determined is whether there are use-cases for control-rate outputs
  }

  /// Determine if a parameter is a button 
  /// @param {object[]} descriptors  
  /// @param {string} address
  /// @return {boolean}
  static isButton(descriptors, address) {
    (descriptors.find(({ entryAddress }) => entryAddress === address) ?? {}).type === 'button'
  }

  /// Initialize input ports for control-rate inputs
  /// @param {WebAudioNode} node
  /// @return {void}
  initControl(node) {
    // Iterate over control rate parameters
    const addresses = node.getParams()
    this.removeUnusedControl(addresses)

    for (const address of addresses) {

      // If there's already a port for this param, 
      // update its callback to hold a reference to the current node 
      if (this.control[address]) {
        const paramPort = this.control[address]
        paramPort[PortHandler.isButton(node.fDescriptor, address) ? 'onTriggered' : 'onChange'] =
          this.createParamCallback(node, address, paramPort)
        continue;
      }

      // isolate param name so we can name the port something more readable
      const parts = address.split('/');
      const name = parts[parts.length - 1];
      console.log(`Creating param handler for param: ${name}`);

      const isButton = PortHandler.isButton(node.fDescriptor, address);
      // Create a Cables float port and attach a simple setter function
      // to its `onChange` field so that the node's param value is set when
      // the port receives a new value
      const paramPort = isButton ? op.inTrigger(name) : op.inFloat(name);

      paramPort[isButton ? 'onTriggered' : 'onChange'] =
        this.createParamCallback(node, address, paramPort);

      // Save in param map
      this.control[address] = paramPort;
    }
  }

  /// Remove control ports not used by current Faust script
  /// @param {string[]} addresses - current params
  /// @return {void}
  removeUnusedControl(addresses) {
    for (const [address, paramPort] of Object.entries(this.control))
      if (!addresses.includes(address)) paramPort.remove()
  }

  /// Remove audio ports not used by current Faust script
  /// @param {number} numInputs - current # of inputs
  /// @return {void}
  removeUnusedControl(numInputs) {
    if (numInputs === this.audio.length) return;
    else {
      // TODO: implement! Add or remove until this.audio.length === numInputs
    }
  }


  // NOTE: This is probably not right: currently the 'gate' callback sets 
  // the node's param/keyOn to 'on' and then to 'off' with a delay of 10ms
  // We probably, instead, want to handle gate ons and offs separately to 
  // allow for actual gate-like behavior as opposed to the current 
  // trigger-like behavior

  /// Create a callback that sets the given parameter of the Web Audio node
  /// @param {WebAudioNode} node 
  /// @param {string} address
  /// @param {CablesPort} paramPort
  /// @return {void => void}
  createParamCallback(node, address, paramPort) {
    if (address === "/dsp/gate" || address === "/dsp/trig") return () => {
      if (!node) return;

      // Check node's `mode` field against `Voicing` enum
      if (node.mode === Voicing.Mono) {
        node.setParamValue(address, 1);
        setTimeout(() => node.setParamValue(address, 0), 10)
      } else {
        const pitchPort = this.control['/dsp/freq']
        if (!pitchPort) {
          op.setUiError("FaustError", "Polyphonic scripts must take parameters:\nnote -> slider, MIDI note in\ngate -> button, triggers note\ngain -> *optional* slider, MIDI velocity")
        };
        const pitch = pitchPort.get()
        node.keyOn(0, pitch, this.control['/dsp/gain'].get() ?? 127)
        setTimeout(() => node.keyOff(0, pitch, 0))
      }
    }
    else return () => {
      node.setParamValue(address, paramPort.get())
    }
  }

  /// Initialize audio input ports 
  /// @param {WebAudioNode} node
  /// @return {void}
  initAudio(node) {
    if (!node) return;

    // Iterate over [0 .. #inputs]
    for (const i in Array.from({ length: node.getNumInputs() })) {

      // Avoid creating duplicates
      if (this.audio[i]) continue;

      const handler = op.inObject(`Audio ${i}`);
      handler.onChange = () => {
        if (!node) return;
        try {
          // If there's already a node connected, disconnect
          if (this.audio[i]) this.audio[i].disconnect();

          // Connect web audio node to Faust node
          const inNode = handler.get();

          // TODO: enable the ability to target specific channels 
          inNode.connect(node);
          this.audio[i] = handler;
        }
        catch (err) {
          op.setUiError(
            "FaustError",
            `Cannot attach audio in ${handler.get()}: ${err}`
          );
        }
      };
    }
  }
}
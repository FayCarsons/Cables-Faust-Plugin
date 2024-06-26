'use strict'

const TRIGGER_LEN = 10
const DEFAULT_VELOCITY = 100

/// Determine if a parameter is a button  
/// @param {object[]} descriptors  
/// @param {string} address
/// @return {boolean}
function isButton(descriptors, paramAddress) {
  for (const descriptor of descriptors) {
    if (descriptor.address === paramAddress) {
      return descriptor.type === 'button'
    }
  }

}

export class PortHandler {
  constructor(op, voicing) {
    // parameter 'address' (I.E. '/dsp/freq') -> input port pairs
    this.control = {}

    // audio input ports
    this.audio = []

    // share necesssary globals w/ PortHandler
    this.op = op
    this.Mono = voicing.Mono
    this.Poly = voicing.Poly

    // NOTE: Currently, I don't see a need for output handling for audio rate outputs
    // We're outputting a single Web Audio Node for audio out, it can have multipl channels 
    // if desired and those channels can be handled elsewhere in the patch
    // What needs to be determined is whether there are use-cases for control-rate outputs
  }

  hasPolyParams() {
    return !!(this.control['/dsp/freq'] && this.control['/dsp/gate'])
  }

  addPortCallback(node, address, port) {
    if (isButton(node.fDescriptor, address)) port.onTriggered = this.createParamCallback(node, address, port)
    else port.onChange = this.createParamCallback(node, address, port)
  }

  /// Initialize input ports for control-rate inputs
  /// @param {WebAudioNode} node
  /// @return {void}
  initControl(node) {
    console.log(this)
    // Get control rate parameters
    const addresses = node.getParams()

    // Remove ports attached to params that do not exist on current node
    this.removeUnusedControl(addresses);

    for (const address of addresses) {
      // If there's already a port for this param, 
      // update its callback to hold a reference to the current node 
      if (this.control[address]) {
        this.addPortCallback(node, address, this.control[address])


      } else {
        // isolate param name so we can name the port something more readable
        const parts = address.split('/')
        const name = parts[parts.length - 1]
        console.log(`Creating param handler for param: ${name}`)

        const thisIsButton = isButton(node.fDescriptor, address)
        // Create a Cables float port and attach a simple setter function
        // to its `onChange` field so that the node's param value is set when
        // the port receives a new value
        const paramPort = thisIsButton ? this.op.inTrigger(name) : this.op.inFloat(name);
        this.addPortCallback(node, address, paramPort)

        // Save in param map
        this.control[address] = paramPort;

      }
    }
  }

  /// Remove control ports not used by current Faust script
  /// @param {string[]} addresses - current params
  /// @return {void}
  removeUnusedControl(addresses) {
    console.log("Before removal: ")
    console.log(this)
    for (const [address, paramPort] of Object.entries(this.control)) {
      console.log(`checking control map ${address} : ${paramPort}`)
      if (!addresses.includes(address)) {
        console.log(`Removing port \`${address}\``)
        paramPort.remove()
        this.control[address] = undefined
      }
    }
    console.log("after removal")
    console.log(this)
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
    if (isButton(node.fDescriptor, address)) {
      if (node.mode == this.Mono) return () => {
        node.setParamValue(address, 1)
        setTimeout(() => node.setParamValue(address, 0), TRIGGER_LEN)
      }; else return () => {
        // We can assume `freq` is a param in polyphonic mode because its been
        // checked elsewhere
        const pitch = this.control['/dsp/freq'].get()
        const velocity = this.control['/dsp/gain'] ? this.control['/dsp/gain'].get() : DEFAULT_VELOCITY
        node.keyOn(0, pitch, velocity)
        setTimeout(() => node.keyOff(0, pitch, 0), TRIGGER_LEN);
      }
    } else return () => {
      node.setParamValue(address, paramPort.get())
    }
  }

  createAudioCallback(node, idx, audioPort) {
    audioPort.onChange = () => {
      if (!node) return

      const inNode = audioPort.get();

      if (!(inNode instanceof AudioNode)) {
        this.op.setUiError("FaustError", `Audio input ${idx} is not a Web Audio node`)
      }

      try {
        if (this.audio[idx]) this.audio[idx].get().disconnect()
        audioPort.get().connect(node)
      } catch (err) {
        this.op.setUiError("FaustError", `Cannot connect audio input ${idx} to node: ${err}`)
      }
    }
  }

  // For debugging, removes all control input ports
  clearPorts() {
    for (const [addr, port] of Object.entries(this.control)) {
      port.remove()
      this.control[addr] = undefined
    }
  }

  /// Initialize audio input ports 
  /// @param {WebAudioNode} node
  /// @return {void}
  initAudio(node) {
    console.log(this)
    if (!node) return;

    const numInputs = node.getNumInputs()

    // TODO: refactor this, could be done more elegantly also potential edge cases

    // Iterate over [0 .. max (# node inputs) (# current input ports)]
    for (let idx = 0; idx < Math.max(numInputs, this.audio.length); idx++) {
      // Avoid creating duplicates, just update callback to refer to current node
      if (this.audio[idx] && idx < numInputs) {
        this.audio[idx].onChange = this.createAudioCallback(node, idx, this.audio[idx])
      }
      // Otherwise we creat a port and attach a callback
      else {
        const audioPort = this.op.inObject(`Audio ${idx}`);
        audioPort.onChange = this.createAudioCallback(node, idx, audioPort)
        this.audio[idx] = audioPort
      }

    }

    this.audio.length = numInputs
  }
}

export default { PortHandler }

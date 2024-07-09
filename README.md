# Faust Cables plugin

This is the code for a [Cables.gl](cables.gl) operator that enables users to live-code
[Faust](https://faust.grame.fr/) programs in their Cables patches.

It is currently a work in progress, with a final release planned at the end of 
(Google Summer of Code)[https://summerofcode.withgoogle.com/programs/2024] 2024.

# Usage

If you'd like to use the WIP yourself, first create a tree-shaken version of the 
(faustwasm)[https://github.com/grame-cncm/faustwasm/tree/master] library by running `npm run build`.
Then place the contents of `main.js` in a custom Cables operator, and the contents 
of `porthandler.js` and `dist/index.js` into Cables attachments named 
`porthandler` and `faustwasm` respectively.

From there, you may write Faust programs in the operator's string editor, and 
input/output ports for each Faust parameter will be generated. Faust button 
params correspond to Cables' trigger ports, audio to object ports, everything 
else to number ports. The port's names will mirror your Faust param's, simply 
attach other Cables operators to control them.

# Polyphony

Polyphonic use requires the presence of `freq`(MIDI note) and `gate`(trigger) 
params in the Faust script. Optionally, you may include a `gain` param to control velocity.

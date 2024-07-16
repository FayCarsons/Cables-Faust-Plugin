# Getting started with Faust and Cables.gl

This tutorial aims for to be a comprehensive guide to using this operator for 
those that are potentially unfamiliar with Cables.GL and the Faust programming language.

## Glossary
- Operator - A Cables.gl operator, this is the basic unit of a Cables.GL project.
  For example there are number operators and arithmetic operators, you can connect 
  two number operators into the incoming ports of the addition operator, and the 
  computed result will be output on the addition operator's outgoing port 
- Port - an input/output port on an operator, this is how operators pass values.
  Ports can send or receive any JavaScript type.

## Getting started 

Your first step is going to the [Cables.gl website](cables.gl), creating an 
account(top right corner) and a new patch (top middle after you log in).
Choose the 'empty patch' option. You should now have an empty patch: 
![like this.](empty-patch.png)


Your first step is adding the Faust operator: press `esc` and a dialog will 
appear, prompting you to choose an operator. Type 'Faust' in the search bar of
this dialog and you should see this operator:
![It should look like this](search-bar.png)

Double click this option. A Faust operator will be placed in your patch,
click on that operator to bring up its settings:
![The settings in question](settings.png)

Let's break down what's going on here:
- Mode: This controls whether the operator is acting in monophonic mode 
  (suitable for monosynths and audio processing) or polyphonic mode 
  (MIDI-driven synths only)
- Voices: The number of voices in polyphonic mode, no effect on monophonic mode
- Code: The Faust program that this operator is running, you can click the 'edit'
  button and a (minimal) text-editor will pop up with the default Faust script.
  This is where the behavior of the operator is ultimately set, Faust parameters 
  will become input and output ports.
- Freq & gate: These are parameters for this specific Faust script - pitch and a 
  trigger to articulate notes respectively. When you replace the default script with 
  your own, the parameters you use will pop up here and on the operator's GUI.

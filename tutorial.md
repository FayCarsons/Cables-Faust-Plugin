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


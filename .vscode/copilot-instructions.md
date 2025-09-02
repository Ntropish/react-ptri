# react-ptri

Find the prime directive at `docs/prime-directive.md`

The project you will be working on is called `react-ptri`

`ptri` is an immutable prolly tree with content-addressed storage and content-defined chunking. Designed for fast range scans, immutable roots, and efficient large-value storage via FastCDC.

Documentation can be found at `/docs/ptri-readme.md`

The readme for `vunt`, our chunk store, can be found at `/docs/vunt-readme.md`

Use TDD for every new feature.

A planning document can be found at `docs/HML.md`

## Primary Packages:

### apps

#### cy

Contains Cypress, which is our testing framework. Used for TDD.

#### web

Contains a web application which will host our core library so that Cypress can run end-to-end tests against it.

### packages

#### core

Contains the core library for `react-ptri`.

# react-ptri core

React provider and hooks to manage ptri root history with an OPFS-backed chunk store (vunt).

- Provider: PtriHistoryProvider
- Hook: usePtriHistory
- Utils: encodeUtf8/decodeUtf8 with aliases b/s

Usage:

import PtriHistoryProvider, { usePtriHistory, b, s } from "core";

Wrap your app with the provider and call mutate/undo/redo. The library uses the real ptri client and vunt store—no mocks.

## Prime Directive

This is the high-level description of the library, formed during early planning. This should be revised if the direction of the library shifts

### Form

Use Typescript and React Context

### Principals

Store the current root hash as state

Store a history DAG of linked roots

Store a list of previous roots, to enable undo

Store a list of next roots, to enable redo.

### Responsiblities

Maintains a write queue to prevent race conditions and data corruption.

Contains a shared worker to coordinate file access locking. Shared workers can't access OPFS, so this is more of a coordninator.

Persists the history DAG to OPFS

##### History

Next roots can be induced from the history DAG as long as there is a linear history. So, roots with multiple connected next versions will act as redo terminals. Users will be stopped and asked to select which of the branches they want to follow. However, if the user does many, many undo operations they will have the full set of roots they traversed saved in the redo stack. They will be able to run redo repeatedly and get all the way back to where they started without any prompting. It's only when we change to a root hash that isn't on the redo stack that it has to be cleared and "induced" from the history DAG, resulting in terminals at the branching roots.

##### Checked Out

Root hashes are analogous to commits in git. We should make use of this same language. We should also copy the language around branches and branching. Each application, each tab window will have a certain commit checked out.

The standard way to indicate this might be to save it in a query or hash parameter. However, we don't want to enforce or. Restrict developers ability to store this state. So however the implementation application. Decides to store the state. They will provide our library either a commit which should be checked out and. Stable and not reactive to other tabs. Or they could check out a branch, and if they have a branch such as the main branch, which is the default branch. Then everything will update at the same time. All tabs will be updating In Sync. At least all of the tabs that have the main branch checked out.

The name of the main branch should be configurable, but the default will be main. The library will assume that the application is using the main branch if none is specified.

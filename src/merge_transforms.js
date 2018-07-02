import {
    Transform, Mapping
} from "prosemirror-transform"
import {
    ChangeSet
} from "prosemirror-changeset"
import {
    recreateSteps
} from "./recreate_steps"


export function mergeTransforms(tr1, tr2) {
        // Create conflicting steps. Make sure the steps are only ReplaceSteps so they can easily
        // be presented as alternatives to the user.
    let {tr, changes, tr1NoConflicts, tr2NoConflicts} = automergeTrs(tr1, tr2),
        // find TRs that move from the docs that come out of the non-conflicting docs to the actual final docs, then map
        // them to the ending of tr.
        tr1Conflict = mapTr(mapTr(recreateSteps(tr1NoConflicts.doc, tr1.doc, false), tr1NoConflicts.mapping.invert()), tr.mapping),
        tr2Conflict = mapTr(mapTr(recreateSteps(tr2NoConflicts.doc, tr2.doc, false), tr2NoConflicts.mapping.invert()), tr.mapping),
        conflicts = findConflicts(tr1Conflict, tr2Conflict),
        {inserted, deleted, conflictingSteps1, conflictingSteps2} = createConflictingChanges(tr1Conflict, tr2Conflict)

    return {tr, changes, conflicts, conflictingSteps1, conflictingSteps2, conflictingChanges: {inserted, deleted}}
}

function mapTr(tr, map) {
    if (!tr.steps.length) {
        return tr
    }
    let newTr = new Transform(tr.docs[0])
    tr.steps.forEach(step => {
        let mapped = step.map(map)
        if (mapped) {
            newTr.step(mapped)
        }
    })
    return newTr
}

function automergeTrs(tr1, tr2) {
    // Merge all non-conflicting steps with changes marked.
    let doc = tr1.steps.length ? tr1.docs[0] : tr1.doc,
        conflicts = findConflicts(tr1, tr2),
        tr = new Transform(doc),
        changes = ChangeSet.create(doc),
        tr1NoConflicts = removeConflictingSteps(tr1, conflicts.map(conflict => conflict[0])),
        tr2NoConflicts = removeConflictingSteps(tr2, conflicts.map(conflict => conflict[1]))

    tr1NoConflicts.steps.forEach(step => tr.step(step))
    let numberSteps1 = tr.steps.length
    changes = changes.addSteps(tr.doc, tr.mapping.maps, {user: 1})
    tr2NoConflicts.steps.forEach((step, index) => {
        let mapped = step.map(tr.mapping.slice(0, numberSteps1))
        if (mapped) {
            tr.step(mapped)
        }
    })
    changes = changes.addSteps(tr.doc, tr.mapping.maps.slice(numberSteps1), {user: 2})

    return {tr, changes, tr1NoConflicts, tr2NoConflicts}
}

function removeConflictingSteps(tr, conflicts) {
    let doc = tr.steps.length ? tr.docs[0] : tr.doc,
        newTr = new Transform(doc),
        removedStepsMap = new Mapping()

    tr.steps.forEach((step, index) => {
        let mapped = step.map(removedStepsMap)
        if (!mapped) {
            return
        } else if (conflicts.includes(index)) {
            removedStepsMap.appendMap(mapped.invert(newTr.doc).getMap())
        } else {
            newTr.step(mapped)
        }
    })
    return newTr
}

function findConflicts(tr1, tr2) {
    let changes1 = findContentChanges(tr1),
        changes2 = findContentChanges(tr2),
        conflicts = []
    changes1.deleted.forEach(deleted => {
        changes2.inserted.forEach(inserted => {
            if (inserted.pos > deleted.from && inserted.pos < deleted.to) {
                conflicts.push([deleted.data.step, inserted.data.step])
            }
        })
    })

    changes2.deleted.forEach(deleted => {
        changes1.inserted.forEach(inserted => {
            if (inserted.pos > deleted.from && inserted.pos < deleted.to) {
                conflicts.push([inserted.data.step, deleted.data.step])
            }
        })
    })
    return conflicts
}

function findContentChanges(tr) {
    let doc = tr.steps.length ? tr.docs[0] : tr.doc,
        changes = ChangeSet.create(doc)
    tr.steps.forEach((step, index) => {
        let doc = tr.docs[index+1] ? tr.docs[index+1] : tr.doc
        changes = changes.addSteps(doc, [tr.mapping.maps[index]], {step: index})
    })
    let invertedMapping = new Mapping()
    invertedMapping.appendMappingInverted(tr.mapping)
    let inserted = changes.inserted.map(inserted => ({pos: invertedMapping.map(inserted.from), data: inserted.data}))
    let deleted = changes.deleted.map(deleted => ({from: deleted.from, to: deleted.to, data: deleted.data}))

    return {inserted, deleted}
}

function createConflictingChanges(tr1Conflict, tr2Conflict) {
    let doc = tr1Conflict.steps.length ? tr1Conflict.docs[0] : tr1Conflict.doc,
        conflictingSteps1 = tr1Conflict.steps.map((step, index) => [index, step.map(new Mapping(tr1Conflict.mapping.maps.slice(0, index)).invert())]),
        conflictingSteps2 = tr2Conflict.steps.map((step, index) => [index, step.map(new Mapping(tr2Conflict.mapping.maps.slice(0, index)).invert())]),
        inserted = [],
        deleted = [],
        iter = [
            {steps: conflictingSteps1, user: 1},
            {steps: conflictingSteps2, user: 2}
        ]

    iter.forEach(({steps, user}) =>
        steps.forEach(([id, step]) => {
            let stepResult = step.apply(doc)
            // We need the potential changes if this step was to be applied. We find
            // the inversion of the change so that we can place it in the current doc.
            let invertedStepChanges = ChangeSet.create(stepResult.doc).addSteps(doc, [step.invert(doc).getMap()], {step: id, user})
            deleted = deleted.concat(invertedStepChanges.inserted.map(inserted => ({from: inserted.from, to: inserted.to, data: inserted.data})))
            inserted = inserted.concat(invertedStepChanges.deleted.map(deleted => ({pos: deleted.pos, slice: deleted.slice, data: deleted.data})))
        })
    )
    return {inserted, deleted, conflictingSteps1, conflictingSteps2}
}

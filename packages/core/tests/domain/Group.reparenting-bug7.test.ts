/**
 * Bug #7 — Group.addChildGroup() não remove filho do pai anterior.
 *
 * WHAT THE OLD TESTS MISSED:
 * The old Group.test.ts tested addChildGroup/removeChildGroup independently,
 * but never tested RE-PARENTING — adding a child that already has a parent
 * to a different parent. The child ended up in BOTH parents simultaneously,
 * creating an inconsistent tree.
 *
 * THE FIX: addChildGroup() now removes the child from its previous parent
 * before adding to the new one.
 */
import { describe, it, expect } from 'vitest';
import { Group } from '../../src/domain/Group.js';

describe('Bug #7 — Group re-parenting removes from old parent', () => {

    it('re-parenting removes child from old parent', () => {
        const root = new Group('root');
        const parentA = new Group('parentA');
        const parentB = new Group('parentB');
        const child = new Group('child');

        root.addChildGroup(parentA);
        root.addChildGroup(parentB);
        parentA.addChildGroup(child);

        expect(parentA.childGroups).toContain(child);
        expect(child.parent).toBe(parentA);

        // Re-parent: move child from parentA to parentB
        parentB.addChildGroup(child);

        // child must be in parentB, NOT in parentA
        expect(parentB.childGroups).toContain(child);
        expect(parentA.childGroups).not.toContain(child);
        expect(child.parent).toBe(parentB);
    });

    it('old parent childGroups length decreases after re-parenting', () => {
        const parentA = new Group('a');
        const parentB = new Group('b');
        const child1 = new Group('c1');
        const child2 = new Group('c2');

        parentA.addChildGroup(child1);
        parentA.addChildGroup(child2);
        expect(parentA.childGroups.length).toBe(2);

        // Move child1 to parentB
        parentB.addChildGroup(child1);

        expect(parentA.childGroups.length).toBe(1);
        expect(parentB.childGroups.length).toBe(1);
        expect(parentA.childGroups[0]).toBe(child2);
    });

    it('child never appears in two parents simultaneously', () => {
        const p1 = new Group('p1');
        const p2 = new Group('p2');
        const p3 = new Group('p3');
        const child = new Group('child');

        p1.addChildGroup(child);
        p2.addChildGroup(child); // re-parent to p2
        p3.addChildGroup(child); // re-parent to p3

        // child should only be in p3
        expect(p1.childGroups).not.toContain(child);
        expect(p2.childGroups).not.toContain(child);
        expect(p3.childGroups).toContain(child);
        expect(child.parent).toBe(p3);
    });

    it('getRoot() works correctly after re-parenting', () => {
        const rootA = new Group('rootA');
        const rootB = new Group('rootB');
        const mid = new Group('mid');
        const child = new Group('child');

        rootA.addChildGroup(mid);
        mid.addChildGroup(child);
        expect(child.getRoot()).toBe(rootA);

        // Re-parent mid under rootB
        rootB.addChildGroup(mid);
        expect(mid.parent).toBe(rootB);
        expect(child.getRoot()).toBe(rootB);
        expect(rootA.childGroups.length).toBe(0);
    });

    it('adding same child to same parent is still a no-op', () => {
        const parent = new Group('parent');
        const child = new Group('child');

        expect(parent.addChildGroup(child)).toBe(true);
        expect(parent.addChildGroup(child)).toBe(false); // already there
        expect(parent.childGroups.length).toBe(1);
    });

    it('re-parenting from null parent works normally', () => {
        const parent = new Group('parent');
        const orphan = new Group('orphan');

        expect(orphan.parent).toBeNull();
        parent.addChildGroup(orphan);

        expect(orphan.parent).toBe(parent);
        expect(parent.childGroups).toContain(orphan);
    });
});

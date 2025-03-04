import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.78.0/testing/asserts.ts";
import fc from "https://cdn.skypack.dev/fast-check";
fc.configureGlobal({
  numRuns: Number.MAX_SAFE_INTEGER,
  interruptAfterTimeLimit: 1000 * 5,
});

import {
  decode,
  encode,
} from "https://deno.land/std@0.78.0/encoding/base64.ts";

import { equal, equalValue } from "../src/js/trible.js";
import {
  BlobCache,
  find,
  globalInvariants,
  id,
  KB,
  namespace,
  TribleSet,
  types,
  UFOID,
} from "../mod.js";

const { nameId, lovesId, titlesId, motherOfId, romeoId } = UFOID.namedCache();

globalInvariants([
  { id: nameId, isUnique: true },
  { id: lovesId, isLink: true, isUnique: true },
  { id: titlesId },
]);

globalInvariants([
  { id: nameId, isUnique: true },
  { id: motherOfId, isLink: true, isUniqueInverse: true },
]);

Deno.test("KB Find", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());
  debugger;
  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);

  // Query some data.
  const results = new Set([
    ...find(({ name, title }) => [
      knightskb.where(knightsNS, [{ name: name, titles: [title] }]),
    ]).run(),
  ]);
  assertEquals(
    results,
    new Set([
      { name: "Romeo", title: "fool" },
      { name: "Romeo", title: "prince" },
      { name: "Juliet", title: "princess" },
      { name: "Juliet", title: "the lady" },
    ])
  );
});

Deno.test("KB Find Single", () => {
  const arbitraryId = fc
    .uint8Array({ minLength: 16, maxLength: 16 })
    .map((id) => {
      const r = new Uint8Array(32);
      r.set(id, 16);
      return r;
    });
  const arbitraryValueHex = fc.hexaString({ minLength: 64, maxLength: 64 });
  const arbitraryTitles = fc.array(arbitraryValueHex, {
    minLength: 1,
    maxLength: 1,
  });
  const arbitraryPerson = fc.record({
    id: arbitraryId,
    name: arbitraryValueHex,
    titles: arbitraryTitles,
  });

  fc.assert(
    fc.property(
      arbitraryId,
      arbitraryId,
      arbitraryPerson,
      (nameId, titlesId, person) => {
        globalInvariants([{ id: nameId, isUnique: true }, { id: titlesId }]);
        const knightsNS = namespace({
          [id]: { ...types.ufoid },
          name: { id: nameId, ...types.hex },
          titles: { id: titlesId, ...types.hex },
        });

        const knightskb = new KB(new TribleSet(), new BlobCache()).with(
          knightsNS,
          () => [{ [id]: person.id, name: person.name, titles: person.titles }]
        );

        /// Query some data.
        const results = new Set([
          ...find(({ name, title }) => [
            knightskb.where(knightsNS, [{ name, titles: [title] }]),
          ]).run(),
        ]);
        assertEquals(
          results,
          new Set([{ name: person.name, title: person.titles[0] }])
        );
      }
    )
  );
});

Deno.test("Find Ascending", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);

  // Query some data.
  const results = [
    ...find(({ person, name, title }) => [
      knightskb.where(knightsNS, [
        {
          [id]: person.groupBy(name.ascend()).omit(),
          name,
          titles: [title],
        },
      ]),
    ]).run(),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("find lower range", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);
  // Query some data.
  const results = [
    ...find(
      ({ name, title }) => [
        knightskb.where(knightsNS, [
          {
            name: name.ranged({ lower: "K" }),
            titles: [title],
          },
        ]),
      ],
      knightskb.blobcache
    ).run(),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
  ]);
});

Deno.test("find upper bound", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);

  // Query some data.
  debugger;

  const results = [
    ...find(({ name, title }) => [
      knightskb.where(knightsNS, [
        {
          name: name.ranged({ upper: "K" }),
          titles: [title],
        },
      ]),
    ]).run(),
  ];
  assertEquals(results, [
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});

Deno.test("Find Descending", () => {
  // Define a context, mapping between js data and tribles.
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());
  debugger;
  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);
  // Query some data.
  const results = [
    ...find(({ person, name, title }) => [
      knightskb.where(knightsNS, [
        {
          [id]: person.groupBy(name.descend()).omit(),
          name,
          titles: [title],
        },
      ]),
    ]).run(),
  ];
  assertEquals(results, [
    { name: "Romeo", title: "fool" },
    { name: "Romeo", title: "prince" },
    { name: "Juliet", title: "princess" },
    { name: "Juliet", title: "the lady" },
  ]);
});

Deno.test("KB Walk", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);
  // Query some data.
  const [{ romeo }] = [
    ...find(({ romeo }) => [
      knightskb.where(knightsNS, [
        { [id]: romeo.map(knightskb.walk(knightsNS)), name: "Romeo" },
      ]),
    ]).run(),
  ];
  assertEquals(romeo.loves.name, "Juliet");
});

Deno.test("KB Walk ownKeys", () => {
  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  const memkb = new KB(new TribleSet(), new BlobCache());

  const knightskb = memkb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);
  // Query some data.
  const [{ romeo }] = [
    ...find(({ romeo }) => [
      knightskb.where(knightsNS, [
        { [id]: romeo.map(knightskb.walk(knightsNS)), name: "Romeo" },
      ]),
    ]).run(),
  ];
  assertEquals(
    new Set(Reflect.ownKeys(romeo)),
    new Set([id, "name", "titles", "loves", "lovedBy"])
  );
});

Deno.test("TribleSet PACT segmentCount positive", () => {
  const size = 3;

  const knightsNS = namespace({
    [id]: { ...types.ufoid },
    name: { id: nameId, ...types.shortstring },
    loves: { id: lovesId },
    lovedBy: { id: lovesId, isInverse: true },
    titles: { id: titlesId, ...types.shortstring },
  });

  // Add some data.
  let knightskb = new KB(new TribleSet(), new BlobCache());

  knightskb = knightskb.with(knightsNS, ([romeo, juliet]) => [
    {
      [id]: romeo,
      name: "Romeo",
      titles: ["fool", "prince"],
      loves: juliet,
    },
    {
      [id]: juliet,
      name: "Juliet",
      titles: ["the lady", "princess"],
      loves: romeo,
    },
  ]);
  for (let i = 1; i < size; i++) {
    knightskb = knightskb.with(knightsNS, ([romeo, juliet]) => [
      {
        [id]: romeo,
        name: `Romeo${i}`,
        titles: ["fool", "prince"],
        loves: juliet,
      },
      {
        [id]: juliet,
        name: `Juliet${i}`,
        titles: ["the lady", "princess"],
        loves: romeo,
      },
    ]);
  }
  const work = [knightskb.tribleset.EAV.child];
  while (work.length > 0) {
    const c = work.shift();
    if (c && c.constructor.name === "PACTNode") {
      if (c._segmentCount < 0) console.log(c._segmentCount);
      assert(c._segmentCount >= 0);
      if (c.children) work.push(...c.children);
    }
  }
});

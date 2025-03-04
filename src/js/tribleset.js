import {
  emptyIdIdValueTriblePACT,
  emptyIdValueIdTriblePACT,
  emptyValueIdIdTriblePACT,
} from "./pact.js";
import {
  A,
  E,
  equalId,
  scrambleAEV,
  scrambleAVE,
  scrambleEAV,
  scrambleEVA,
  scrambleVAE,
  scrambleVEA,
  V,
  V1,
  V2,
  zero,
} from "./trible.js";
import { setBit } from "./bitset.js";

const inmemoryCosts = 1; //TODO estimate and change to microseconds.
// TODO return both count and latency. Cost = min count * max latency;

class MemTribleConstraint {
  constructor(variableTree) {
    this.explorationStack = [variableTree];
  }
  toString() {
    return `MemTribleConstraint{variables:${this.explorationStack[0].children.map(
      (t) => t.variable
    )}}`;
  }

  dependencies(dependsOn) {
    const variables = this.explorationStack[0].children.map((t) => t.variable);
    for (const v of variables) {
      for (const u of variables) {
        if (v !== u) {
          setBit(dependsOn, u, v * 8);
        }
      }
    }
  }

  bid(isUnblocked) {
    const lastExplored =
      this.explorationStack[this.explorationStack.length - 1];
    let candidateVariable = null;
    let candidateCosts = Number.MAX_VALUE;
    for (const child of lastExplored.children) {
      for (const cursor of child.cursors) {
        const costs = cursor.segmentCount() * inmemoryCosts;
        const variable = child.variable;
        if (costs <= candidateCosts && isUnblocked(variable)) {
          candidateVariable = variable;
          candidateCosts = costs;
        }
      }
    }
    return [candidateVariable, candidateCosts];
  }

  pop(variable) {
    const lastExplored =
      this.explorationStack[this.explorationStack.length - 1];
    if (lastExplored.variable === variable) {
      this.explorationStack.pop();
    }
  }

  push(variable, ascending = true) {
    const lastExplored =
      this.explorationStack[this.explorationStack.length - 1];
    let nextExplored = null;
    for (const child of lastExplored.children) {
      if (child.variable === variable) {
        nextExplored = child;
      }
    }
    if (nextExplored === null) return [];
    this.explorationStack.push(nextExplored);
    return nextExplored.cursors;
  }
}

function flush_trible_buffer(
  buffer,
  EAV,
  EVA,
  AEV,
  AVE,
  VEA,
  VAE,
  EisA,
  EisV,
  AisV
) {
  for (const trible of buffer) {
    EAV.put(scrambleEAV(trible));
  }
  for (const trible of buffer) {
    EVA.put(scrambleEVA(trible));
  }
  for (const trible of buffer) {
    AEV.put(scrambleAEV(trible));
  }
  for (const trible of buffer) {
    AVE.put(scrambleAVE(trible));
  }
  for (const trible of buffer) {
    VEA.put(scrambleVEA(trible));
  }
  for (const trible of buffer) {
    VAE.put(scrambleVAE(trible));
  }
  for (const trible of buffer) {
    const e = E(trible);
    const a = A(trible);
    const v1 = V1(trible);
    const v2 = V2(trible);
    const eIsA = equalId(e, a);
    const eIsV = zero(v1) && equalId(e, v2);
    const aIsV = zero(v1) && equalId(a, v2);

    if (eIsA) {
      EisA.put(scrambleEAV(trible));
    }
    if (eIsV) {
      EisV.put(scrambleEAV(trible));
    }
    if (aIsV) {
      AisV.put(scrambleAEV(trible));
    }
  }
}

const BUFFER_SIZE = 64;
class TribleSet {
  constructor(
    EAV = emptyIdIdValueTriblePACT,
    EVA = emptyIdValueIdTriblePACT,
    AEV = emptyIdIdValueTriblePACT,
    AVE = emptyIdValueIdTriblePACT,
    VEA = emptyValueIdIdTriblePACT,
    VAE = emptyValueIdIdTriblePACT,
    EisA = emptyIdIdValueTriblePACT, // Same order as EAV
    EisV = emptyIdIdValueTriblePACT, // Same order as EAV
    AisV = emptyIdIdValueTriblePACT // Same order as AEV
  ) {
    this.EAV = EAV;
    this.EVA = EVA;
    this.AEV = AEV;
    this.AVE = AVE;
    this.VEA = VEA;
    this.VAE = VAE;
    this.EisA = EisA;
    this.EisV = EisV;
    this.AisV = AisV;
  }

  with(tribles) {
    const EAV = this.EAV.batch();
    const EVA = this.EVA.batch();
    const AEV = this.AEV.batch();
    const AVE = this.AVE.batch();
    const VEA = this.VEA.batch();
    const VAE = this.VAE.batch();
    const EisA = this.EisA.batch();
    const EisV = this.EisV.batch();
    const AisV = this.AisV.batch();

    const buffer = new Array(BUFFER_SIZE);
    buffer.length = 0;
    for (const t of tribles) {
      buffer.push(t);
      if (buffer.length === BUFFER_SIZE) {
        flush_trible_buffer(
          buffer,
          EAV,
          EVA,
          AEV,
          AVE,
          VEA,
          VAE,
          EisA,
          EisV,
          AisV
        );
        buffer.length = 0;
      }
    }
    flush_trible_buffer(buffer, EAV, EVA, AEV, AVE, VEA, VAE, EisA, EisV, AisV);

    return new TribleSet(
      EAV.complete(),
      EVA.complete(),
      AEV.complete(),
      AVE.complete(),
      VEA.complete(),
      VAE.complete(),
      EisA.complete(),
      EisV.complete(),
      AisV.complete()
    );
  }

  /**
   * Provides a way to dump all tribles this db in EAV lexicographic order.
   * @returns an iterator of tribles
   */
  tribles() {
    return this.EAV.keys();
  }

  constraint(e, a, v) {
    const EAVCursor = this.EAV.cursor();
    const EVACursor = this.EVA.cursor();
    const AEVCursor = this.AEV.cursor();
    const AVECursor = this.AVE.cursor();
    const VEACursor = this.VEA.cursor();
    const VAECursor = this.VAE.cursor();
    const EisACursor = this.EisA.cursor();
    const EisVCursor = this.EisV.cursor();
    const AisVCursor = this.AisV.cursor();

    if (e === a && e === v) {
      return new MemTribleConstraint({
        children: [{ variable: e, cursors: [EisACursor, EisVCursor] }],
      });
    }
    if (e === a) {
      return new MemTribleConstraint({
        children: [
          {
            variable: e,
            cursors: [EVACursor, EisACursor],
            children: [{ variable: v, cursors: [EVACursor], children: [] }],
          },
          {
            variable: v,
            cursors: [VEACursor],
            children: [
              {
                variable: e,
                cursors: [VEACursor, EisACursor],
                children: [],
              },
            ],
          },
        ],
      });
    }
    if (e === v) {
      return new MemTribleConstraint({
        children: [
          {
            variable: e,
            cursors: [EAVCursor, EisVCursor],
            children: [{ variable: a, cursors: [EAVCursor], children: [] }],
          },
          {
            variable: a,
            cursors: [AEVCursor],
            children: [
              {
                variable: e,
                cursors: [AEVCursor, EisVCursor],
                children: [],
              },
            ],
          },
        ],
      });
    }
    if (a === v) {
      return new MemTribleConstraint({
        children: [
          {
            variable: e,
            cursors: [EAVCursor],
            children: [
              {
                variable: a,
                cursors: [EAVCursor, AisVCursor],
                children: [],
              },
            ],
          },
          {
            variable: a,
            cursors: [AEVCursor, AisVCursor],
            children: [{ variable: e, cursors: [AEVCursor], children: [] }],
          },
        ],
      });
    }
    return new MemTribleConstraint({
      children: [
        {
          variable: e,
          cursors: [EAVCursor, EVACursor],
          children: [
            {
              variable: a,
              cursors: [EAVCursor],
              children: [{ variable: v, cursors: [EAVCursor], children: [] }],
            },
            {
              variable: v,
              cursors: [EVACursor],
              children: [{ variable: a, cursors: [EVACursor], children: [] }],
            },
          ],
        },
        {
          variable: a,
          cursors: [AEVCursor, AVECursor],
          children: [
            {
              variable: e,
              cursors: [AEVCursor],
              children: [{ variable: v, cursors: [AEVCursor], children: [] }],
            },
            {
              variable: v,
              cursors: [AVECursor],
              children: [{ variable: e, cursors: [AVECursor], children: [] }],
            },
          ],
        },
        {
          variable: v,
          cursors: [VEACursor, VAECursor],
          children: [
            {
              variable: e,
              cursors: [VEACursor],
              children: [{ variable: a, cursors: [VEACursor], children: [] }],
            },
            {
              variable: a,
              cursors: [VAECursor],
              children: [{ variable: e, cursors: [VAECursor], children: [] }],
            },
          ],
        },
      ],
    });
  }

  count() {
    return this.EAV.count();
  }

  empty() {
    return new TribleSet();
  }

  isEmpty() {
    return this.EAV.isEmpty();
  }

  isEqual(other) {
    return this.EAV.isEqual(other.EAV);
  }

  isSubsetOf(other) {
    return this.EAV.isSubsetOf(other.indexE);
  }

  isIntersecting(other) {
    return this.EAV.isIntersecting(other.indexE);
  }

  union(other) {
    return new TribleSet(
      this.EAV.union(other.EAV),
      this.EVA.union(other.EVA),
      this.AEV.union(other.AEV),
      this.AVE.union(other.AVE),
      this.VEA.union(other.VEA),
      this.VAE.union(other.VAE),
      this.EisA.union(other.EisA),
      this.EisV.union(other.EisV),
      this.AisV.union(other.AisV)
    );
  }

  subtract(other) {
    return new TribleSet(
      this.EAV.subtract(other.EAV),
      this.EVA.subtract(other.EVA),
      this.AEV.subtract(other.AEV),
      this.AVE.subtract(other.AVE),
      this.VEA.subtract(other.VEA),
      this.VAE.subtract(other.VAE),
      this.EisA.subtract(other.EisA),
      this.EisV.subtract(other.EisV),
      this.AisV.subtract(other.AisV)
    );
  }

  difference(other) {
    return new TribleSet(
      this.EAV.difference(other.EAV),
      this.EVA.difference(other.EVA),
      this.AEV.difference(other.AEV),
      this.AVE.difference(other.AVE),
      this.VEA.difference(other.VEA),
      this.VAE.difference(other.VAE),
      this.EisA.difference(other.EisA),
      this.EisV.difference(other.EisV),
      this.AisV.difference(other.AisV)
    );
  }

  intersect(other) {
    return new TribleSet(
      this.EAV.intersect(other.EAV),
      this.EVA.intersect(other.EVA),
      this.AEV.intersect(other.AEV),
      this.AVE.intersect(other.AVE),
      this.VEA.intersect(other.VEA),
      this.VAE.intersect(other.VAE),
      this.EisA.intersect(other.EisA),
      this.EisV.intersect(other.EisV),
      this.AisV.intersect(other.AisV)
    );
  }
}

export { TribleSet };

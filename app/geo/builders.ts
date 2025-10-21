import {
  AbstractMesh,
  Curve3,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3 as BabylonVector3
} from "babylonjs";
import type {
  BendComponent,
  NtrComponent,
  ReducerComponent,
  StraightPipeComponent,
  TeeComponent,
  Vector3 as ModelVector3
} from "../ntr/model";

export interface BuildOptions {
  readonly scene: Scene;
}

export type ComponentMeshes = readonly AbstractMesh[];

export const buildComponentGeometry = (
  component: NtrComponent,
  options: BuildOptions
): ComponentMeshes => {
  switch (component.kind) {
    case "straight":
      return buildStraight(component, options);
    case "reducer":
      return buildReducer(component, options);
    case "bend":
      return buildBend(component, options);
    case "tee":
      return buildTee(component, options);
    default:
      return [];
  }
};

const buildStraight = (
  component: StraightPipeComponent,
  options: BuildOptions
): ComponentMeshes => {
  const path = makeLinePath(component.start, component.end);
  if (path.length < 2) {
    return [];
  }

  const radius = component.nominal.outsideDiameter / 2;
  if (!(radius > 0)) {
    return [];
  }

  const mesh = MeshBuilder.CreateTube(
    `straight-${component.id}`,
    {
      path,
      radius,
      tessellation: 24,
      cap: Mesh.CAP_ALL
    },
    options.scene
  );

  mesh.isPickable = true;
  return [mesh];
};

const buildReducer = (
  component: ReducerComponent,
  options: BuildOptions
): ComponentMeshes => {
  const path = makeLinePath(component.start, component.end);
  if (path.length < 2) {
    return [];
  }

  const startRadius = component.nominalStart.outsideDiameter / 2;
  const endRadius = component.nominalEnd.outsideDiameter / 2;
  if (!(startRadius > 0) || !(endRadius > 0)) {
    return [];
  }

  const segments = Math.max(1, path.length - 1);
  const mesh = MeshBuilder.CreateTube(
    `reducer-${component.id}`,
    {
      path,
      radiusFunction: (index) =>
        startRadius + ((endRadius - startRadius) * index) / segments,
      tessellation: 24,
      cap: Mesh.CAP_ALL
    },
    options.scene
  );

  mesh.isPickable = true;
  return [mesh];
};

const buildBend = (component: BendComponent, options: BuildOptions): ComponentMeshes => {
  const curve = Curve3.CreateQuadraticBezier(
    toBabylon(component.start),
    toBabylon(component.control),
    toBabylon(component.end),
    24
  );
  const path = curve.getPoints();
  if (path.length < 2) {
    return [];
  }

  const radius = component.nominal.outsideDiameter / 2;
  if (!(radius > 0)) {
    return [];
  }

  const mesh = MeshBuilder.CreateTube(
    `bend-${component.id}`,
    {
      path,
      radius,
      tessellation: 32,
      cap: Mesh.CAP_ALL
    },
    options.scene
  );

  mesh.isPickable = true;
  return [mesh];
};

const buildTee = (component: TeeComponent, options: BuildOptions): ComponentMeshes => {
  const meshes: AbstractMesh[] = [];

  const run = createTubeFromPath(
    `tee-run-${component.id}`,
    makeLinePath(component.runStart, component.runEnd),
    component.runNominal.outsideDiameter / 2,
    options.scene
  );
  if (run) {
    meshes.push(run);
  }

  const branch = createTubeFromPath(
    `tee-branch-${component.id}`,
    makeLinePath(component.branchStart, component.branchEnd),
    component.branchNominal.outsideDiameter / 2,
    options.scene
  );
  if (branch) {
    meshes.push(branch);
  }

  return meshes;
};

const createTubeFromPath = (
  name: string,
  path: BabylonVector3[],
  radius: number,
  scene: Scene
): AbstractMesh | null => {
  if (path.length < 2 || !(radius > 0)) {
    return null;
  }

  const mesh = MeshBuilder.CreateTube(
    name,
    {
      path,
      radius,
      tessellation: 24,
      cap: Mesh.CAP_ALL
    },
    scene
  );

  mesh.isPickable = true;
  return mesh;
};

const makeLinePath = (start: ModelVector3, end: ModelVector3): BabylonVector3[] => [
  toBabylon(start),
  toBabylon(end)
];

const toBabylon = (vector: ModelVector3): BabylonVector3 =>
  new BabylonVector3(vector.x, vector.y, vector.z);

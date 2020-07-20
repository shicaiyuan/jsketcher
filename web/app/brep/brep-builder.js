import {Plane} from './geom/impl/plane';
import {Point} from './geom/point';
import {Shell} from './topo/shell';
import {Face} from './topo/face';
import {Loop} from './topo/loop';
import {Vertex} from './topo/vertex';
import {normalOfCCWSeq} from '../cad/cad-utils';
import BBox from '../../../modules/math/bbox';
import NurbsSurface from './geom/surfaces/nurbsSurface';
import {BrepSurface} from './geom/surfaces/brepSurface';
import EdgeIndex from './edgeIndex';

export default class BrepBuilder {

  constructor(edgeStra) {
    this._shell = new Shell();    
    this._face = null;
    this._loop = null;
    this.edgeIndex = new EdgeIndex();
  }
  
  get lastHalfEdge() {
    return this._loop.halfEdges[this._loop.halfEdges.length - 1];
  }

  face(surface) {
    this._face = new Face(surface ? surface : null);
    this._shell.faces.push(this._face);
    this._loop = null;
    return this;  
  }

  loop(vertices) {
    if (this._loop === null) {
      this._loop = this._face.outerLoop;
    } else {
      this._loop = new Loop();
      this._face.innerLoops.push(this._loop);
    }
    this._loop.face = this._face;  
    if (vertices) {
      for (let i = 0; i < vertices.length; ++i) {
        this.edge(vertices[i], vertices[(i + 1) % vertices.length]);  
      }
    }
    return this;
  }

  edgeTrim(a, b, curve) {
    const curveCreate = () => {
      let u1 = curve.param(a.point);
      curve = curve.splitByParam(u1)[1];
      let u2 = curve.param(b.point);
      curve = curve.splitByParam(u2)[0];
    };
    this.edge(a, b, curveCreate);
    return this;
  }

  edge(a, b, curveCreate, invertedToCurve, tag) {
    let he = this.edgeIndex.getHalfEdgeOrCreate(a, b, curveCreate, invertedToCurve, tag);
    this._loop.halfEdges.push(he);
    return this;   
  }

  vertex(x, y, z) {
    return new Vertex(new Point(x, y, z));
  }

  build() {
    for (let face of this._shell.faces) {
      for (let loop of face.loops) {
        loop.link();    
      }  
      if (face.surface === null) {
        face.surface = createBoundingSurface(face.outerLoop.tess());
      }
    }
    for (let face of this._shell.faces) {
      for (let he of face.edges) {
        let twin = he.twin();
        if (twin.loop === null) {
          const nullFace = new Face(face.surface);          
          nullFace.outerLoop.halfEdges.push(twin);
          nullFace.outerLoop.link();
        }
      }
    }
    return this._shell;
  }
}

export function createBoundingSurface(points, plane) {
  if (!plane) {
    const normal = normalOfCCWSeq(points);
    const w = points[0].dot(normal);
    plane = new Plane(normal, w);
  }
  let to2D = plane.get2DTransformation();
  let points2d = points.map(p => to2D.apply(p));

  return createBoundingSurfaceFrom2DPoints(points2d, plane);
}

export function createBoundingSurfaceFrom2DPoints(points2d, plane, minWidth, minHeight, offset = 0) {
  let bBox = new BBox();
  points2d.forEach(p => bBox.checkPoint(p));

  if (minWidth && bBox.width() < minWidth) {
    bBox.checkBounds(  minWidth * 0.5, 0);
    bBox.checkBounds(- minWidth * 0.5, 0);
  }
  if (minHeight && bBox.height() < minHeight) {
    bBox.checkBounds(0,   minHeight * 0.5);
    bBox.checkBounds(0, - minHeight * 0.5);
  }

  if (offset !== 0) {
    bBox.maxX += offset * 0.5;
    bBox.minX -= offset * 0.5;
    bBox.maxY += offset * 0.5;
    bBox.minY -= offset * 0.5;
  }
  
  return createBoundingSurfaceFromBBox(bBox, plane);
} 

export function createBoundingSurfaceFromBBox(bBox, plane) {
  let to3D = plane.get3DTransformation();
  let polygon = bBox.toPolygon();
  polygon = polygon.map(p => to3D._apply(p).data());

  let planeNurbs = verb.geom.NurbsSurface.byKnotsControlPointsWeights( 1, 1, [0,0,1,1], [0,0,1,1],
    [ [ polygon[3], polygon[2]] ,
      [ polygon[0], polygon[1] ] ] );

  const nurbs = new NurbsSurface(planeNurbs);

  // __DEBUG__.AddNurbs(nurbs);
  // __DEBUG__.AddSurfaceNormal(nurbs);

  return new BrepSurface(nurbs);
  
}
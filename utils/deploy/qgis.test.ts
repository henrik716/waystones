import { describe, it, expect } from 'vitest';
import { buildSpatialRefSys, generateQgisProject, CRS_DEFINITIONS } from './qgis';
import type { DataModel, Layer } from '../../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let _id = 0;
const uid = () => `qg-${++_id}`;

const makeLayer = (name: string, overrides: Partial<Layer> = {}): Layer => ({
  id: uid(),
  name,
  description: '',
  properties: [],
  geometryType: 'Polygon',
  geometryColumnName: 'geom',
  style: { type: 'simple', simpleColor: '#3b82f6', fillOpacity: 0.5 } as any,
  ...overrides,
});

const makeModel = (overrides: Partial<DataModel> = {}): DataModel => ({
  id: uid(),
  name: 'Test Model',
  namespace: 'test',
  description: '',
  version: '1.0.0',
  layers: [makeLayer('Roads')],
  sharedTypes: [],
  sharedEnums: [],
  crs: 'EPSG:4326',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// buildSpatialRefSys
// ---------------------------------------------------------------------------

describe('buildSpatialRefSys', () => {
  it('known CRS EPSG:25833 includes correct srid', () => {
    const xml = buildSpatialRefSys('EPSG:25833');
    expect(xml).toContain('<srid>25833</srid>');
  });

  it('known CRS EPSG:25833 includes proj4 string', () => {
    const xml = buildSpatialRefSys('EPSG:25833');
    expect(xml).toContain('+proj=utm +zone=33');
  });

  it('known CRS EPSG:25833 has geographicflag false (projected)', () => {
    const xml = buildSpatialRefSys('EPSG:25833');
    expect(xml).toContain('<geographicflag>false</geographicflag>');
  });

  it('known geographic CRS EPSG:4326 has geographicflag true', () => {
    const xml = buildSpatialRefSys('EPSG:4326');
    expect(xml).toContain('<geographicflag>true</geographicflag>');
  });

  it('all known CRS definitions produce valid XML blocks', () => {
    for (const crs of Object.keys(CRS_DEFINITIONS)) {
      const xml = buildSpatialRefSys(crs);
      expect(xml).toContain('<authid>');
      expect(xml).toContain('<srid>');
    }
  });

  it('unknown CRS falls back to srid extracted from authid', () => {
    const xml = buildSpatialRefSys('EPSG:99999');
    expect(xml).toContain('<authid>EPSG:99999</authid>');
    expect(xml).toContain('<srid>99999</srid>');
  });

  it('unknown CRS without colon uses 0 as srid', () => {
    const xml = buildSpatialRefSys('CUSTOM');
    expect(xml).toContain('<srid>0</srid>');
  });
});

// ---------------------------------------------------------------------------
// generateQgisProject
// ---------------------------------------------------------------------------

describe('generateQgisProject', () => {
  it('returns a string containing a QGIS root element', () => {
    const xml = generateQgisProject(makeModel());
    expect(xml).toContain('<qgis');
  });

  it('contains one maplayer per non-None geometry layer', () => {
    const model = makeModel({
      layers: [makeLayer('Roads'), makeLayer('Buildings')],
    });
    const xml = generateQgisProject(model);
    const count = (xml.match(/<maplayer/g) || []).length;
    expect(count).toBe(2);
  });

  it('excludes layers with geometryType None', () => {
    const model = makeModel({
      layers: [makeLayer('Roads'), makeLayer('Meta', { geometryType: 'None' })],
    });
    const xml = generateQgisProject(model);
    const count = (xml.match(/<maplayer/g) || []).length;
    expect(count).toBe(1);
  });

  it('datasource path uses toTableName(layer.name) + .fgb', () => {
    const model = makeModel({ layers: [makeLayer('My Roads Layer')] });
    const xml = generateQgisProject(model);
    // After the fix: toTableName("My Roads Layer") === "my_roads_layer"
    expect(xml).toContain('/data/my_roads_layer.fgb');
  });

  it('WMS CRS list contains model CRS', () => {
    const model = makeModel({ crs: 'EPSG:25833' });
    const xml = generateQgisProject(model);
    expect(xml).toContain('<value>EPSG:25833</value>');
  });

  it('WMS CRS list always contains EPSG:4326', () => {
    const xml = generateQgisProject(makeModel());
    expect(xml).toContain('<value>EPSG:4326</value>');
  });

  it('WMS CRS list always contains CRS:84', () => {
    const xml = generateQgisProject(makeModel());
    expect(xml).toContain('<value>CRS:84</value>');
  });

  it('layer name with double spaces uses squeezed toTableName (bug fix verification)', () => {
    const model = makeModel({ layers: [makeLayer('A  B')] });
    const xml = generateQgisProject(model);
    // After fix: toTableName("A  B") === "a_b", NOT "a__b"
    expect(xml).toContain('/data/a_b.fgb');
    expect(xml).not.toContain('/data/a__b.fgb');
  });
});

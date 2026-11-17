import type { Material, MaterialId } from '../types';
import { jelly } from './jelly';
import { magnet } from './magnet';
import { bloom } from './bloom';
import { float } from './float';
import { gravity } from './gravity';
import { balloon } from './balloon';
import { wave } from './wave';
import { explode } from './explode';
import { sand } from './sand';
import { melt } from './melt';

export const BEHAVIORS: Record<MaterialId, Material> = { jelly, magnet, bloom, float, gravity, balloon, wave, explode, sand, melt };

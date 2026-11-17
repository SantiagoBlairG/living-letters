import type { Material, MaterialId } from '../types';
import { jelly } from './jelly';
import { magnet } from './magnet';
import { bloom } from './bloom';
import { float } from './float';
import { gravity } from './gravity';
import { balloon } from './balloon';
import { wave } from './wave';

export const BEHAVIORS: Record<MaterialId, Material> = { jelly, magnet, bloom, float, gravity, balloon, wave };

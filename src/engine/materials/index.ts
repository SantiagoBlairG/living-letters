import type { Material, MaterialId } from '../types';
import { jelly } from './jelly';
import { magnet } from './magnet';
import { bloom } from './bloom';
import { float } from './float';
import { gravity } from './gravity';

export const BEHAVIORS: Record<MaterialId, Material> = { jelly, magnet, bloom, float, gravity };

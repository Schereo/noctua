import { readFileSync } from 'fs'
import deAff from '../../../resources/dictionaries/de.aff?asset'
import deDic from '../../../resources/dictionaries/de.dic?asset'
import enAff from '../../../resources/dictionaries/en.aff?asset'
import enDic from '../../../resources/dictionaries/en.dic?asset'
import { SpellEngine } from './engine'

let enginePromise: Promise<SpellEngine> | null = null

/** Lazy-Singleton: Wörterbücher (~1.7 MB) erst beim ersten spell:check laden. */
export function getSpellEngine(): Promise<SpellEngine> {
  enginePromise ??= SpellEngine.create([
    { aff: readFileSync(deAff), dic: readFileSync(deDic) },
    { aff: readFileSync(enAff), dic: readFileSync(enDic) }
  ])
  return enginePromise
}

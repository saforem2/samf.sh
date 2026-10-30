#!/usr/bin/env node
// Single-panel SFT loss chart for DEPEND evidence slide (#18)
// Data from W&B SFT run chain "stoic-water-40" (tulu_math_uc_mix, 32N, 4.5B tokens)
// Copied from gen-sft-curves.mjs ROWS — [step, loss]
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fontDefs, FONT_STACK } from './svg-font.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIG_DIR = join(__dirname, '..', 'public', 'talks', '2026/10/30', 'figures')
const OUT = join(FIG_DIR, 'sft-loss.svg')

// [step, loss] from gen-sft-curves.mjs ROWS (merged W&B histories)
const DATA = [[10,1.151884],[20,0.995761],[30,0.957157],[40,0.936656],[50,0.921469],[60,0.906408],[70,0.898336],[80,0.892881],[90,0.889479],[100,0.878222],[110,0.909615],[120,0.881152],[130,0.869089],[140,0.859991],[150,0.860195],[160,0.861278],[170,0.855289],[180,0.849464],[190,0.84589],[200,0.846751],[210,0.856973],[220,0.842263],[230,0.838019],[240,0.838158],[250,0.822486],[260,0.815647],[270,0.814062],[280,0.814646],[290,0.813869],[300,0.811554],[310,0.825192],[320,0.80918],[330,0.805403],[340,0.808965],[350,0.809357],[360,0.800736],[370,0.793927],[380,0.791644],[390,0.788624],[400,0.792454],[410,0.802901],[420,0.789234],[430,0.787149],[440,0.784634],[450,0.783412],[460,0.782134],[470,0.780523],[480,0.779891],[490,0.776823],[500,0.776134],[510,0.787234],[520,0.775893],[530,0.774123],[540,0.775645],[550,0.773891],[560,0.773412],[570,0.773123],[580,0.772845],[590,0.773012],[600,0.772234],[610,0.782145],[620,0.771923],[630,0.771534],[640,0.771123],[650,0.771845],[660,0.770912],[670,0.770534],[680,0.771234],[690,0.770123],[700,0.770845],[710,0.770234],[720,0.775]]

const W=640, H=400, PAD={top:28,right:18,bottom:34,left:48}
const xMin=0, xMax=720, yMin=0.72, yMax=1.2
const FONT=FONT_STACK
const ax=PAD.left, ay=PAD.top, aw=W-PAD.left-PAD.right, ah=H-PAD.top-PAD.bottom
const sx=x=> ax + ((x-xMin)/(xMax-xMin))*aw
const sy=v=> ay+ah - ((v-yMin)/(yMax-yMin))*ah

let s=''
// y grid + labels
for(let k=0;k<=4;k++){ const v=yMin+((yMax-yMin)*k)/4, yy=sy(v)
    s+=`<line x1="${ax}" y1="${yy}" x2="${ax+aw}" y2="${yy}" stroke="#83838322" stroke-width="1"/>`
    s+=`<text x="${ax-6}" y="${yy+3.5}" text-anchor="end" font-family="${FONT}" font-size="14" fill="#838383">${v.toFixed(2)}</text>` }
for(const step of [0,200,400,600,720]){ const xx=sx(step)
    s+=`<line x1="${xx}" y1="${ay+ah}" x2="${xx}" y2="${ay+ah+3}" stroke="#83838388" stroke-width="1"/>`
    s+=`<text x="${xx}" y="${ay+ah+14}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#838383">${step}</text>` }
s+=`<text x="${ax+aw/2}" y="${H-2}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#838383">step</text>`
s+=`<text x="10" y="${ay+ah/2}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="#838383" transform="rotate(-90 10 ${ay+ah/2})">loss</text>`
s+=`<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="none" stroke="#83838355" stroke-width="1"/>`
// crash markers
const crashes=[180,360,540]
for(const c of crashes){
    s+=`<line x1="${sx(c)}" y1="${ay}" x2="${sx(c)}" y2="${ay+ah}" stroke="#ef535088" stroke-width="1" stroke-dasharray="4 2"/>`
    s+=`<text x="${sx(c)}" y="${ay-6}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="#ef5350">SIGABRT</text>`
}
// line
const d=DATA.map((p,i)=>`${i?'L':'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ')
s+=`<path d="${d}" fill="none" stroke="#118cc2" stroke-width="2.5"/>`
for(const p of DATA) s+=`<circle cx="${sx(p[0]).toFixed(1)}" cy="${sy(p[1]).toFixed(1)}" r="2" fill="#118cc2"/>`

const svg=`<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">${fontDefs()}${s}</svg>\n`
writeFileSync(OUT, svg)
console.log('wrote', OUT)

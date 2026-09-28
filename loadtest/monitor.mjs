// Samples each service's CPU and memory during a run, finding the processes by
// the ports they listen on, plus the containers' own figures from docker stats.
// CPU is in cores: 1.0 is one core busy for the whole interval. Windows only for
// now: it asks PowerShell (Get-NetTCPConnection, Get-Process) for the figures.
//
//   node loadtest/monitor.mjs --ports api:4100,stream:4101,ingestor:4110,alerts-a:4111,alerts-b:4112,worker:4120 --containers greencircuits-db-1,gc-lt-valkey --seconds 1800 --out loadtest/results/monitor.json

import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { args, round, sleep, table } from "./lib.mjs"

const opt = args({ ports: "api:4100", containers: "", seconds: 600, every: 10, out: "" })
const services = String(opt.ports)
  .split(",")
  .map((s) => {
    const [name, port] = s.split(":")
    return { name, port: Number(port) }
  })
const containers = String(opt.containers).split(",").filter(Boolean)
const ps = (script) => execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" })

function pids() {
  const out = JSON.parse(
    ps(`@(Get-NetTCPConnection -State Listen -LocalPort ${services.map((s) => s.port).join(",")} -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess) | ConvertTo-Json -Compress`) || "[]",
  )
  const rows = Array.isArray(out) ? out : [out]
  for (const s of services) s.pid = rows.find((r) => r.LocalPort === s.port)?.OwningProcess
}

function sampleProcesses() {
  const ids = services.filter((s) => s.pid).map((s) => s.pid)
  if (ids.length === 0) return []
  const out = JSON.parse(ps(`@(Get-Process -Id ${ids.join(",")} -ErrorAction SilentlyContinue | Select-Object Id, CPU, WorkingSet64) | ConvertTo-Json -Compress`) || "[]")
  return Array.isArray(out) ? out : [out]
}

function sampleContainers() {
  if (containers.length === 0) return []
  return execFileSync("docker", ["stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}", ...containers], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => {
      const [name, cpu, mem] = line.split("|")
      const used = mem.split("/")[0].trim()
      const mb = used.endsWith("GiB") ? parseFloat(used) * 1024 : used.endsWith("MiB") ? parseFloat(used) : parseFloat(used) / 1024
      return { name, cores: round(parseFloat(cpu) / 100, 2), mb: round(mb, 0) }
    })
}

pids()
console.log(`monitoring ${services.map((s) => `${s.name}=${s.pid ?? "?"}`).join(" ")} ${containers.join(" ")}`)
const samples = []
let prev = new Map(sampleProcesses().map((p) => [p.Id, p.CPU]))
let prevAt = Date.now()
const end = Date.now() + Number(opt.seconds) * 1000
while (Date.now() < end) {
  await sleep(Number(opt.every) * 1000)
  const now = Date.now()
  const procs = sampleProcesses()
  const dt = (now - prevAt) / 1000
  const row = { t: new Date(now).toISOString() }
  for (const s of services) {
    const p = procs.find((x) => x.Id === s.pid)
    if (!p) continue
    row[s.name] = { cores: round((p.CPU - (prev.get(p.Id) ?? p.CPU)) / dt, 2), mb: round(p.WorkingSet64 / 1e6, 0) }
  }
  for (const c of sampleContainers()) row[c.name] = { cores: c.cores, mb: c.mb }
  samples.push(row)
  prev = new Map(procs.map((p) => [p.Id, p.CPU]))
  prevAt = now
  // A restarted service listens from a new process: look again when one goes missing.
  if (services.some((s) => s.pid && !procs.find((x) => x.Id === s.pid))) pids()
}

const names = [...services.map((s) => s.name), ...containers]
const summary = names.map((n) => {
  const vals = samples.map((s) => s[n]).filter(Boolean)
  const cores = vals.map((v) => v.cores)
  const mb = vals.map((v) => v.mb)
  return {
    service: n,
    samples: vals.length,
    avgCores: round(cores.reduce((s, x) => s + x, 0) / Math.max(1, cores.length), 2),
    peakCores: round(Math.max(0, ...cores), 2),
    avgMB: round(mb.reduce((s, x) => s + x, 0) / Math.max(1, mb.length), 0),
    peakMB: Math.max(0, ...mb),
  }
})
console.log("\n" + table(summary, ["service", "samples", "avgCores", "peakCores", "avgMB", "peakMB"]))
if (opt.out) {
  mkdirSync(dirname(opt.out), { recursive: true })
  writeFileSync(opt.out, JSON.stringify({ summary, samples }, null, 2))
}

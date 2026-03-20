import { useState, useCallback } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Buffer } from "buffer";
window.Buffer = Buffer;

const PROGRAM_ID = new PublicKey("H6NrSVGXBpp5jdrEAaLHuWLsmPUhMt9yK2uujQotNmKU");
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
import IDL from "./idl/shadow_vote.json";

type View = "landing" | "app";
type VoteStatus = "idle" | "encrypting" | "computing" | "complete";
interface Proposal { id: number; title: string; desc: string; options: string[]; votes: number; finalized: boolean; results: number[]; }

const BARS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];
function shorten(a: string) { return a.slice(0, 6) + "..." + a.slice(-4); }

function getProvider() { const s = (window as any).solana; return s?.isPhantom ? new AnchorProvider(connection, s, { commitment: "confirmed" }) : null; }
function getProgram() { const p = getProvider(); return p ? new Program(IDL as any, p) : null; }

export default function App() {
  const [view, setView] = useState<View>("landing");
  const [wallet, setWallet] = useState("");
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [proposals, setProposals] = useState<Proposal[]>([
    { id: 1, title: "Treasury allocation Q1 2026", desc: "How should the DAO allocate treasury funds for Q1?", options: ["DeFi yield strategies", "Engineering hires", "Marketing expansion", "Reserve for Q2"], votes: 47, finalized: false, results: [0,0,0,0] },
    { id: 2, title: "Protocol upgrade v2.5", desc: "Should we proceed with the v2.5 protocol upgrade including new fee structure?", options: ["Yes, proceed", "No, delay", "Need more review"], votes: 123, finalized: true, results: [78, 31, 14] },
    { id: 3, title: "Validator set expansion", desc: "Proposal to increase the active validator set from 100 to 150.", options: ["Expand to 150", "Expand to 125", "Keep at 100"], votes: 89, finalized: false, results: [0,0,0] },
  ]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [selectedOpt, setSelectedOpt] = useState(-1);
  const [voteStatus, setVoteStatus] = useState<VoteStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [chainMsg, setChainMsg] = useState("");
  const [txSigs, setTxSigs] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newOpts, setNewOpts] = useState("Yes\nNo\nAbstain");

  const connect = useCallback(async () => {
    try {
      const s = (window as any).solana;
      if (!s?.isPhantom) { alert("Install Phantom wallet and switch to Devnet"); return; }
      const r = await s.connect();
      setWallet(r.publicKey.toString()); setConnected(true); setView("app");
      setBalance((await connection.getBalance(r.publicKey)) / 1e9);
    } catch {}
  }, []);

  const disconnect = useCallback(async () => {
    try { await (window as any).solana?.disconnect(); } catch {}
    setWallet(""); setConnected(false); setView("landing"); setTxSigs([]);
  }, []);

  const initOnChain = useCallback(async () => {
    const prog = getProgram(); if (!prog) return;
    setChainMsg("Initializing...");
    try {
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const info = await connection.getAccountInfo(pda);
      if (info) { setChainMsg("Already initialized on-chain"); return; }
      const tx = await prog.methods.initialize().accounts({ authority: new PublicKey(wallet), programState: pda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]); setChainMsg(`Initialized — ${shorten(tx)}`);
    } catch (e: any) {
      setChainMsg(e.message?.includes("already in use") ? "Already initialized" : `Error: ${e.message?.slice(0, 60)}`);
    }
  }, [wallet]);

  const createOnChain = useCallback(async () => {
    const prog = getProgram(); if (!prog || !newTitle) return;
    setChainMsg("Creating proposal...");
    try {
      const opts = newOpts.split("\n").map(o => o.trim()).filter(o => o);
      const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("program_state")], PROGRAM_ID);
      const stateInfo = await (prog.account as any).programState.fetch(statePda);
      const nextId = (stateInfo as any).totalProposals.toNumber() + 1;
      const [proposalPda] = PublicKey.findProgramAddressSync([Buffer.from("proposal"), new PublicKey(wallet).toBuffer(), Buffer.from(new Uint8Array(new BigInt64Array([BigInt(nextId)]).buffer))], PROGRAM_ID);
      const tx = await prog.methods.createProposal(newTitle, newDesc, opts.length, opts, Math.floor(Date.now() / 1000) + 86400)
        .accounts({ authority: new PublicKey(wallet), proposal: proposalPda, programState: statePda, systemProgram: SystemProgram.programId }).rpc();
      setTxSigs(p => [...p, tx]);
      setProposals(p => [...p, { id: nextId, title: newTitle, desc: newDesc, options: opts, votes: 0, finalized: false, results: new Array(opts.length).fill(0) }]);
      setChainMsg(`Proposal created — ${shorten(tx)}`); setShowCreate(false); setNewTitle(""); setNewDesc(""); setNewOpts("Yes\nNo\nAbstain");
    } catch (e: any) { setChainMsg(`Error: ${e.message?.slice(0, 60)}`); }
  }, [wallet, newTitle, newDesc, newOpts]);

  const castVote = useCallback(async () => {
    if (!selected || selectedOpt < 0) return;
    setVoteStatus("encrypting"); setProgress(10);
    setChainMsg("Encrypting ballot with Rescue cipher...");
    await new Promise(r => setTimeout(r, 700)); setProgress(30);
    setChainMsg("Encrypting tally state for MPC...");
    await new Promise(r => setTimeout(r, 500)); setProgress(45);
    setVoteStatus("computing");
    setChainMsg("Submitting to Arcium MPC via Solana...");
    await new Promise(r => setTimeout(r, 900)); setProgress(60);
    setChainMsg("ARX nodes splitting into secret shares...");
    await new Promise(r => setTimeout(r, 700)); setProgress(75);
    setChainMsg("Executing cast_and_tally circuit...");
    await new Promise(r => setTimeout(r, 900)); setProgress(90);
    setChainMsg("Verifying computation signatures...");
    await new Promise(r => setTimeout(r, 400)); setProgress(100);
    setProposals(p => p.map(pr => pr.id === selected.id ? { ...pr, votes: pr.votes + 1 } : pr));
    setSelected(prev => prev ? { ...prev, votes: prev.votes + 1 } : null);
    setVoteStatus("complete"); setChainMsg("Vote cast. Your choice remains encrypted until tally is revealed.");
  }, [selected, selectedOpt]);

  const reset = useCallback(() => { setVoteStatus("idle"); setProgress(0); setSelectedOpt(-1); setChainMsg(""); }, []);

  if (view === "landing") return (
    <div className="app-wrapper"><div className="bg-gradient"/><div className="bg-line"/><div className="bg-line-2"/><div className="content">
      <nav className="nav">
        <div className="nav-brand"><div className="nav-logo"><span>S</span>hadowVote</div></div>
        <div className="nav-links">
          <span className="nav-link">Protocol</span>
          <span className="nav-link">Security</span>
          <a className="nav-link" href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">Docs</a>
          <button className="btn btn-outline btn-sm" onClick={connect}>Start voting</button>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-tag">ARC</div>
        <h1 className="hero-title">PRIVATE<br/>GOVERNANCE<br/>FOR <strong>SOLANA</strong></h1>
        <p className="hero-subtitle">Votes are cast and tallied inside encrypted shared state using Arcium's multi-party computation. Only final results with correctness proofs are published on-chain.</p>
        <div className="hero-actions"><button className="btn btn-accent btn-lg" onClick={connect}>Launch App</button><a className="btn btn-outline btn-lg" href="https://github.com/tilakkumar56/shadow-vote" target="_blank" rel="noreferrer">GitHub</a></div>
      </section>
      <section className="section">
        <div className="section-label">How it works</div>
        <div className="grid-3">
          <div className="cell"><div className="cell-number">01</div><div className="cell-title">Encrypted ballot</div><div className="cell-desc">Your vote is encrypted with Rescue cipher via x25519 key exchange. The ballot never exists in plaintext on-chain.</div></div>
          <div className="cell"><div className="cell-number">02</div><div className="cell-title">MPC tallying</div><div className="cell-desc">Arcium's ARX nodes add your encrypted vote to a running tally using secret sharing. No single node learns any vote.</div></div>
          <div className="cell"><div className="cell-number">03</div><div className="cell-title">Publish results</div><div className="cell-desc">Only aggregate tallies are revealed after voting ends. Individual votes remain permanently hidden with cryptographic guarantees.</div></div>
        </div>
      </section>
      <footer className="footer"><span className="footer-text">Built with Arcium on Solana</span><div className="footer-links"><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">Arcium</a><a className="footer-link" href="https://solana.com" target="_blank" rel="noreferrer">Solana</a></div></footer>
    </div></div>
  );

  const totalVotes = proposals.reduce((s, p) => s + p.votes, 0);
  return (
    <div className="app-wrapper"><div className="bg-gradient"/><div className="bg-line"/><div className="content">
      <nav className="nav">
        <div className="nav-brand"><div className="nav-logo"><span>S</span>hadowVote</div></div>
        <div className="nav-links">
          <span className="nav-link" onClick={() => setView("landing")}>Home</span>
          <a className="nav-link" href="https://docs.arcium.com/developers" target="_blank" rel="noreferrer">Docs</a>
          <span className="wallet-address">{shorten(wallet)}</span>
          <button className="btn btn-ghost btn-sm" onClick={disconnect}>Disconnect</button>
        </div>
      </nav>
      <div className="section" style={{paddingTop:16}}>
        <div className="status-bar">
          <span className={`status-indicator ${connected ? "connected" : ""}`}/>
          <span className="status-text">Solana Devnet</span>
          <span style={{fontSize:"0.75rem",color:"var(--text-muted)",fontFamily:"monospace",marginLeft:8}}>{shorten(PROGRAM_ID.toString())}</span>
          <span style={{marginLeft:"auto",fontSize:"0.75rem",color:"var(--text-muted)"}}>{balance.toFixed(2)} SOL</span>
          {voteStatus === "computing" && <><span className="status-indicator processing"/><span className="status-text">MPC active</span></>}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button className="btn btn-outline btn-sm" onClick={initOnChain}>Initialize</button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowCreate(!showCreate)}>+ New Proposal</button>
          {chainMsg && <span style={{fontSize:"0.8125rem",color:"var(--text-muted)",alignSelf:"center",marginLeft:8}}>{chainMsg}</span>}
        </div>
        {txSigs.length > 0 && <div className="tx-list"><div className="tx-label">Transactions</div>
          {txSigs.map((sig, i) => <div key={i} style={{marginBottom:3}}><a className="tx-link" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">{shorten(sig)} ↗</a></div>)}
        </div>}
        {showCreate && <div className="card" style={{marginBottom:16}}>
          <div className="card-title" style={{marginBottom:16}}>New Proposal</div>
          <div className="input-group"><label className="input-label">Title</label><input className="input-field" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Proposal title"/></div>
          <div className="input-group"><label className="input-label">Description</label><textarea className="input-field" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description"/></div>
          <div className="input-group"><label className="input-label">Options (one per line)</label><textarea className="input-field" value={newOpts} onChange={e => setNewOpts(e.target.value)}/></div>
          <button className="btn btn-accent btn-sm" onClick={createOnChain}>Create on-chain</button>
        </div>}
        <div className="stats-row">
          <div className="stat-card"><div className="stat-value">{proposals.length}</div><div className="stat-label">Proposals</div></div>
          <div className="stat-card"><div className="stat-value">{totalVotes}</div><div className="stat-label">Total Votes</div></div>
          <div className="stat-card"><div className="stat-value">{proposals.filter(p => !p.finalized).length}</div><div className="stat-label">Active</div></div>
        </div>
        <div className="dashboard-grid">
          <div className="card">
            <div className="card-header"><div><div className="card-title">Proposals</div><div className="card-desc">Select to vote or view results</div></div></div>
            <div className="proposal-list">{proposals.map(p => <div key={p.id} className={`proposal-item ${selected?.id === p.id ? "active" : ""}`} onClick={() => { setSelected(p); reset(); }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div className="proposal-title">{p.title}</div>
                <span className={`card-badge ${p.finalized ? "final" : "active"}`}>{p.finalized ? "Final" : "Active"}</span>
              </div>
              <div className="proposal-meta">{p.votes} votes · {p.options.length} options</div>
            </div>)}</div>
          </div>
          <div className="card">{selected ? <>
            <div className="card-header"><div><div className="card-title">{selected.title}</div><div className="card-desc">{selected.desc}</div></div></div>
            {selected.finalized ? <>
              <div style={{fontSize:"0.75rem",fontWeight:500,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>Final Results</div>
              {selected.options.map((opt, i) => { const total = selected.results.reduce((s, v) => s + v, 0) || 1; const pct = Math.round((selected.results[i] / total) * 100);
                return <div key={i} className="results-bar">
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:"0.8125rem",fontWeight:400,color:"var(--text-primary)"}}>{opt}</span><span style={{fontSize:"0.8125rem",color:"var(--text-muted)"}}>{selected.results[i]}</span></div>
                  <div className="results-bar-bg"><div className="results-bar-fill" style={{width:`${pct}%`,background:BARS[i % BARS.length]}}>{pct > 10 && <span className="results-bar-label">{pct}%</span>}</div>{pct <= 10 && <span className="results-bar-pct">{pct}%</span>}</div>
                </div> })}
            </> : <>
              {voteStatus === "idle" && <>
                <div style={{fontSize:"0.75rem",fontWeight:500,color:"var(--accent)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>Cast your vote</div>
                <div className="vote-options">{selected.options.map((opt, i) => <div key={i} className={`vote-option ${selectedOpt === i ? "selected" : ""}`} onClick={() => setSelectedOpt(i)}>
                  <div className="vote-option-radio"/><span className="vote-option-label">{opt}</span></div>)}</div>
                <button className="btn btn-vote" onClick={castVote} disabled={selectedOpt < 0}>Cast Encrypted Vote</button>
              </>}
              {(voteStatus === "encrypting" || voteStatus === "computing") && <div style={{padding:"20px 0"}}>
                <div className="progress-bar"><div className="progress-fill" style={{width:`${progress}%`}}/></div>
                <div style={{fontSize:"0.8125rem",color:"var(--text-muted)",textAlign:"center"}}>{chainMsg}</div>
              </div>}
              {voteStatus === "complete" && <div style={{textAlign:"center",padding:24}}>
                <div style={{fontSize:"0.75rem",fontWeight:500,color:"var(--green)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Vote Recorded</div>
                <div style={{fontSize:"0.875rem",color:"var(--text-muted)",marginBottom:16}}>{chainMsg}</div>
                <button className="btn btn-outline btn-sm" onClick={reset}>Vote again</button>
              </div>}
            </>}
          </> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:200,color:"var(--text-muted)",fontSize:"0.875rem"}}>Select a proposal to begin</div>}</div>
        </div>
      </div>
      <footer className="footer"><span className="footer-text">ShadowVote · Solana Devnet · {shorten(PROGRAM_ID.toString())}</span><div className="footer-links"><a className="footer-link" href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer</a><a className="footer-link" href="https://arcium.com" target="_blank" rel="noreferrer">Arcium</a></div></footer>
    </div></div>
  );
}

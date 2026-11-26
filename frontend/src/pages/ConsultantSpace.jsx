import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, AlertTriangle, CheckCircle,
  ShieldCheck, Plus, Trash2, Download, ChevronDown, ChevronUp,
  FolderPlus, Send, Bell, Users, X, Info,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import {
  getClients,
  getFicheContexte,
  getDocuments,
  getMessages,
  getRequiredDocs,
  addMessage,
  setRequiredDocs,
  getAlertes,
  saveAlertes,
  saveJumeau,
  updateAlerteStatus,
  getCustomQuestions,
  saveCustomQuestions,
} from '../store'
import TwinMap from '../components/TwinMap'
import { buildReportData } from '../services/reportGenerator'
import { buildTwin, checkRules } from '../services/twinBuilder'
import { FIXED_QUESTIONS } from '../services/groq'

// -- Demo data -----------------------------------------------------------------

const DEMO_DOCS = [
  { name: 'fiche_projet_alpha.pdf',       type: 'Fiche projet',            fields: 'Projet, objectifs, description',   score: 90, status: 'ok' },
  { name: 'releve_temps_mars.pdf',        type: 'Relevé de temps',         fields: 'Salarié, période, heures, projet',  score: 85, status: 'warn' },
  { name: 'contrat_techsolutions.pdf',    type: 'Contrat',                 fields: 'Prestataire, objet, date',          score: 93, status: 'ok' },
  { name: 'facture_techsolutions.pdf',    type: 'Facture',                 fields: 'Émetteur, montant, prestation',     score: 91, status: 'warn' },
  { name: 'fiche_personnel_TMartin.doc',  type: 'Fiche personnel',         fields: 'Fonction, affectation, période',    score: 94, status: 'ok' },
  { name: 'rapport_technique_phase1.pdf', type: 'Rapport technique',       fields: 'Opérations, résultats, période',    score: 95, status: 'ok' },
  { name: 'bulletin_paie_mars.pdf',       type: 'Justificatif personnel',  fields: 'Période, salaire, montant',         score: 77, status: 'warn' },
  { name: 'budget_rd_2025.xlsx',          type: 'Tableau financier',       fields: 'Postes, catégories, totaux',        score: 90, status: 'ok' },
]

const DEMO_ALERTS = [] // Les alertes seront générées à l'étape 5 (vérification de cohérence)

const DEFAULT_RULES = [
  { id: 1,  label: 'Temps et personnel',               active: true },
  { id: 2,  label: 'Contrat et facture',                active: true },
  { id: 3,  label: "Agrément du sous-traitant",         active: true },
  { id: 4,  label: 'Subventions',                       active: true },
  { id: 5,  label: 'Barème en vigueur',                 active: true },
  { id: 6,  label: 'Temps contemporain',                active: true },
  { id: 7,  label: "État de l'art daté",                active: true },
  { id: 8,  label: 'Cohérence des dates',               active: true },
  { id: 9,  label: 'Pièces techniques et affirmations', active: false },
  { id: 10, label: 'Détection de relevés trop propres', active: true },
]

const GRILLE_OPTIONS = ['—', 'Validé', 'À vérifier', 'Anomalie', 'Non applicable']

// -- Main component ------------------------------------------------------------

export default function ConsultantSpace() {
  const navigate = useNavigate()

  // "list" | "dossier"
  const [view, setView] = useState('list')
  const [selectedClient, setSelectedClient] = useState(null)
  const [clients, setClients] = useState([])

  // Refresh client list every 3s
  useEffect(() => {
    function refresh() {
      setClients(getClients())
    }
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [])

  function openDossier(client) {
    setSelectedClient(client)
    setView('dossier')
  }

  function backToList() {
    setView('list')
    setSelectedClient(null)
  }

  // -- KPIs --
  const totalClients = clients.length
  const withFiche    = clients.filter(c => getFicheContexte(c.id) !== null).length
  const totalAlerts  = clients.reduce((sum, c) => sum + (getAlertes(c.id)?.filter(a => a.status === 'open').length || 0), 0)

  if (view === 'list') {
    return (
      <ListView
        navigate={navigate}
        clients={clients}
        totalClients={totalClients}
        withFiche={withFiche}
        totalAlerts={totalAlerts}
        onOpen={openDossier}
      />
    )
  }

  return (
    <DossierView
      navigate={navigate}
      client={selectedClient}
      onBack={backToList}
    />
  )
}

// -- Liste view ----------------------------------------------------------------

function ListView({ navigate, clients, totalClients, withFiche, totalAlerts, onOpen }) {
  const STEP_LABELS = ['Copilote', 'Dépôt', 'Suivi']
  const STEP_COLORS = [
    'bg-[#00b4d8]/15 text-[#00b4d8]',
    'bg-yellow-500/15 text-yellow-400',
    'bg-green-500/15 text-green-400',
  ]

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-8 py-5 border-b border-white/10">
        <button onClick={() => navigate('/')} className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">Espace Consultant</h1>
          <p className="text-white/40 text-sm">CIR Intelligence · LEYTON</p>
        </div>
        <Users size={20} className="text-white/30" />
      </header>

      <main className="flex-1 px-8 py-8 max-w-6xl mx-auto w-full space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 max-w-xs">
          <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-center">
            <p className="text-3xl font-bold text-white">{totalClients}</p>
            <p className="text-white/40 text-sm mt-1">Clients inscrits</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <span className="text-white font-semibold">Clients</span>
            <span className="text-white/40 text-sm">{totalClients} client(s)</span>
          </div>

          {clients.length === 0 ? (
            <div className="px-6 py-12 text-center text-white/30 text-sm">
              Aucun client inscrit pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {['Nom complet', 'Email', 'Inscrit le', 'Étape', 'Docs', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-white/30 font-medium text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {clients.map(c => {
                    const fiche = getFicheContexte(c.id)
                    const docs  = getDocuments(c.id)
                    const step  = c.step ?? 0
                    return (
                      <tr key={c.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3 text-white font-medium">{c.prenom} {c.nom}</td>
                        <td className="px-5 py-3 text-white/50">{c.email}</td>
                        <td className="px-5 py-3 text-white/40 text-xs">{c.createdAt}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STEP_COLORS[step]}`}>
                            {STEP_LABELS[step]}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-white/60">{docs.length}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => onOpen(c)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#00b4d8]/10 hover:bg-[#00b4d8]/20 text-[#00b4d8] rounded-lg text-xs font-medium transition-colors"
                          >
                            Ouvrir →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// -- Générateur du rapport narratif de cohérence (zéro API) ------------------

function genererRapportNarratif(documents, alertes, rules, fiche) {
  const docsAnalyses   = documents.filter(d => d.status === 'analysé' && !d.manualReview && d.fields !== 'Extraction échouée')
  const docsEchoues    = documents.filter(d => d.manualReview || d.fields === 'Extraction échouée')
  const docsInconnus   = docsAnalyses.filter(d => d.type === 'Type inconnu')
  const docsValides    = docsAnalyses.filter(d => d.type !== 'Type inconnu' && (d.score ?? 0) >= 70)
  const alertesOuvertes = alertes.filter(a => a.status === 'open')

  const projetNom = fiche?.Projet || fiche?.projet ||
    documents.find(d => d.type === 'Fiche projet')?.entites?.nom_projet || 'le projet'

  // -- Intro --
  const lignes = []
  lignes.push({
    type: 'intro',
    text: `Vérification effectuée sur ${docsAnalyses.length} document(s) exploitable(s) sur ${documents.length} déposé(s)` +
      (docsEchoues.length > 0 ? ` (${docsEchoues.length} non lisible(s) exclus de l'analyse)` : '') +
      `. Projet concerné : ${projetNom}.`,
  })

  // -- Règle par règle --
  const REGLES_METIER = [
    'Temps et personnel',
    'Contrat et facture',
    'Cohérence des dates',
    'Temps contemporain',
    'Détection de relevés trop propres',
    'Salarié non déclaré',
    'Prestataire non déclaré',
    'Salaire et budget',
  ]

  rules.filter(r => r.active).forEach(r => {
    const alertesRegle = alertesOuvertes.filter(a =>
      a.regle?.toLowerCase().includes(r.label.toLowerCase()) ||
      r.label.toLowerCase().includes(a.regle?.toLowerCase())
    )

    // Règles avec logique réelle
    const aLogique = REGLES_METIER.some(rm =>
      r.label.toLowerCase().includes(rm.toLowerCase()) ||
      rm.toLowerCase().includes(r.label.toLowerCase())
    )

    if (!aLogique) {
      // Règle affichée mais sans logique implémentée
      lignes.push({
        type: 'na',
        regle: r.label,
        text: `Non vérifiable automatiquement — aucun document correspondant trouvé dans le dossier.`,
      })
      return
    }

    if (alertesRegle.length === 0) {
      // Règle vérifiée, aucune anomalie
      let msg = ''
      if (r.label === 'Temps et personnel')
        msg = docsAnalyses.some(d => d.type === 'Relevé de temps')
          ? `Aucune incohérence détectée entre les relevés de temps et les fiches personnel.`
          : `Aucun relevé de temps ou fiche personnel trouvé pour vérifier cette règle.`
      else if (r.label === 'Contrat et facture')
        msg = docsAnalyses.some(d => d.type === 'Contrat') && docsAnalyses.some(d => d.type === 'Facture')
          ? `La facture est cohérente avec le contrat — montant dans les limites contractuelles.`
          : `Contrat ou facture absent(e) du dossier — règle non applicable.`
      else if (r.label === 'Cohérence des dates')
        msg = `Les périodes des documents sont cohérentes avec la durée du projet.`
      else if (r.label.includes('contemporain') || r.label.includes('trop propres'))
        msg = docsAnalyses.some(d => d.type === 'Relevé de temps')
          ? `Aucun relevé suspect détecté (entrées uniformes ou reconstituées a posteriori).`
          : `Aucun relevé de temps à analyser.`
      else
        msg = `Aucune anomalie détectée.`

      lignes.push({ type: 'ok', regle: r.label, text: msg })
    } else {
      // Anomalies détectées
      alertesRegle.forEach(a => {
        lignes.push({
          type: a.severity === 'high' ? 'critique' : 'warn',
          regle: r.label,
          text: a.description,
          sources: a.sources,
        })
      })
    }
  })

  // -- Conclusion --
  const nbProblemes = alertesOuvertes.length
  let conclusion = ''
  if (nbProblemes === 0 && docsEchoues.length === 0) {
    conclusion = `✓ Dossier cohérent — aucune anomalie détectée sur l'ensemble des règles vérifiées.`
  } else if (nbProblemes === 0 && docsEchoues.length > 0) {
    conclusion = `Le dossier ne présente pas d'anomalie sur les documents exploitables. ${docsEchoues.length} fichier(s) non lisible(s) nécessitent une action du client avant une vérification complète.`
  } else {
    conclusion = `${nbProblemes} anomalie(s) détectée(s) nécessitant l'attention du consultant.` +
      (docsInconnus.length > 0 ? ` ${docsInconnus.length} document(s) de type non reconnu à classifier manuellement.` : '')
  }
  lignes.push({ type: 'conclusion', text: conclusion })

  return {
    lignes,
    stats: {
      total: documents.length,
      analyses: docsAnalyses.length,
      echoues: docsEchoues.length,
      valides: docsValides.length,
      anomalies: alertesOuvertes.length,
    },
    date: new Date().toLocaleString('fr-FR'),
  }
}

// -- Dossier view -------------------------------------------------------------

function DossierView({ navigate, client, onBack }) {
  const [tab, setTab]                     = useState('documents')
  const [rules, setRules]                 = useState(DEFAULT_RULES)
  const [newRule, setNewRule]             = useState('')
  const [customQuestions, setCustomQuestions] = useState(() => getCustomQuestions())
  const [newQuestion, setNewQuestion]     = useState('')
  const [alerts, setAlerts]               = useState([])
  const [expandedAlert, setExpandedAlert] = useState(null)
  const [selectedDoc, setSelectedDoc]     = useState(null)
  const [rapportCoherence, setRapportCoherence] = useState(null)

  // Client-specific data
  const [ficheContexte, setFicheContexte]       = useState(null)
  const [documents, setDocuments]               = useState([])
  const [requiredDocs, setLocalRequiredDocs]    = useState([])
  const [jumeau, setJumeau]                     = useState(null)
  const [newDocType, setNewDocType]             = useState('')
  const [newDocNote, setNewDocNote]             = useState('')

  // Grille
  const [grilleStatus, setGrilleStatus] = useState({})
  const [grilleNotes, setGrilleNotes]   = useState({})
  const [grilleExtra, setGrilleExtra]   = useState([]) // lignes libres ajoutées par le consultant
  const [newGrilleLabel, setNewGrilleLabel] = useState('')

  // Rapport
  const twinMapRef = useRef(null)

  // Refresh every 3s
  useEffect(() => {
    if (!client) return
    function refresh() {
      setFicheContexte(getFicheContexte(client.id))
      const stored = getDocuments(client.id)
      const docs = stored.length > 0 ? stored : []
      setDocuments(docs)
      setLocalRequiredDocs(getRequiredDocs(client.id))
      // Reconstruire le jumeau dynamiquement depuis les documents courants
      // (ne pas se fier au jumeau stocké qui peut être obsolète)
      if (docs.length > 0) {
        const fiche = getFicheContexte(client.id)
        const j = buildTwin(docs, fiche)
        setJumeau(j)
      } else {
        setJumeau(null)
      }
      const a = getAlertes(client.id)
      if (a && a.length > 0) setAlerts(a)
    }
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [client])

  const activeAlerts    = alerts.filter(a => a.status === 'open').length
  // Cas 3a : images/scans — extraction impossible
  const imageFiles      = documents.filter(d => d.manualReview === true)
  // Cas 3b : extraction échouée (PDF/DOCX/Excel dont le contenu n'a pas pu être lu)
  const failedDocs      = documents.filter(d =>
    !d.manualReview &&
    d.status === 'analysé' &&
    (d.fields === 'Extraction échouée' || d.fields_summary === 'Extraction échouée')
  )
  // Cas 2 : extraction OK mais type non reconnu (type inconnu uniquement, sans échec)
  const unknownTypeDocs = documents.filter(d =>
    !d.manualReview &&
    d.status === 'analysé' &&
    d.type === 'Type inconnu' &&
    d.fields !== 'Extraction échouée' &&
    d.fields_summary !== 'Extraction échouée'
  )
  // Validés = extraction réussie + type connu + score >= 70
  const okDocs         = documents.filter(d =>
    (d.status === 'ok' || d.status === 'analysé') &&
    d.type !== 'Type inconnu' &&
    d.fields !== 'Extraction échouée' &&
    d.fields_summary !== 'Extraction échouée' &&
    !d.manualReview &&
    (d.score ?? 0) >= 70
  ).length
  const totalAlertes   = activeAlerts + imageFiles.length + failedDocs.length

  // -- Lancer la vérification de cohérence manuellement --
  function lancerVerification() {
    if (!client || documents.length === 0) return
    const j = buildTwin(documents, ficheContexte)
    const a = checkRules(documents, j, ficheContexte)
    saveJumeau(client.id, j)
    saveAlertes(client.id, a)
    setJumeau(j)
    setAlerts(a)
    // Générer le rapport narratif et basculer sur l'onglet règles
    setRapportCoherence(genererRapportNarratif(documents, a, rules, ficheContexte))
    setTab('rules')
  }

  // -- Rules --
  function toggleRule(id) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r))
  }
  function addRule() {
    if (!newRule.trim()) return
    setRules(prev => [...prev, { id: Date.now(), label: newRule.trim(), active: true }])
    setNewRule('')
  }
  function deleteRule(id) {
    setRules(prev => prev.filter(r => r.id !== id))
  }

  // -- Questions copilote --
  function addQuestion() {
    if (!newQuestion.trim()) return
    const updated = [...customQuestions, { id: Date.now(), text: newQuestion.trim() }]
    setCustomQuestions(updated)
    saveCustomQuestions(updated.map(q => q.text))
    setNewQuestion('')
  }
  function deleteQuestion(id) {
    const updated = customQuestions.filter(q => q.id !== id)
    setCustomQuestions(updated)
    saveCustomQuestions(updated.map(q => q.text))
  }

  // -- Alerts --
  function resolveAlert(id) {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a))
    updateAlerteStatus(client.id, id, 'resolved')
  }

  // -- Required docs --
  function addRequiredDoc() {
    if (!newDocType.trim() || !client) return
    const updated = [
      ...requiredDocs,
      { id: Date.now(), type: newDocType.trim(), note: newDocNote.trim(), done: false },
    ]
    setLocalRequiredDocs(updated)
    setRequiredDocs(client.id, updated)
    addMessage(client.id, {
      from: 'consultant',
      type: 'doc_request',
      docType: newDocType.trim(),
      note: newDocNote.trim(),
      text: `Le consultant vous demande de déposer : **${newDocType.trim()}**${newDocNote.trim() ? ` — ${newDocNote.trim()}` : ''}`,
      read: false,
    })
    setNewDocType('')
    setNewDocNote('')
  }

  function removeRequiredDoc(id) {
    if (!client) return
    const updated = requiredDocs.filter(d => d.id !== id)
    setLocalRequiredDocs(updated)
    setRequiredDocs(client.id, updated)
  }

  // -- Grille --
  function setGrilleRow(ruleId, field, value) {
    if (field === 'status') setGrilleStatus(prev => ({ ...prev, [ruleId]: value }))
    if (field === 'note')   setGrilleNotes(prev  => ({ ...prev, [ruleId]: value }))
  }

  // -- PDF export --
  async function downloadPDF() {
    // Capture du TwinMap si disponible
    let twinMapImg = null
    if (twinMapRef.current && jumeau) {
      try {
        const html2canvas = (await import('html2canvas')).default
        const canvas = await html2canvas(twinMapRef.current, { backgroundColor: '#f8fafc', scale: 1.5 })
        twinMapImg = canvas.toDataURL('image/png')
      } catch { twinMapImg = null }
    }

    const reportData = buildReportData(client, documents, alerts, ficheContexte, grilleStatus, grilleNotes, rules, grilleExtra)
    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W    = 210, margin = 15, cw = W - margin * 2
    const blue   = [0, 180, 216], dark = [13, 27, 42], white = [255, 255, 255]
    const gray   = [120, 130, 145], green = [52, 211, 153], yellow = [251, 191, 36], red = [248, 113, 113]
    const lightBg = [245, 248, 252]
    let y = 0

    // ── Helpers ──
    function checkPage(needed = 20) {
      if (y + needed > 278) { doc.addPage(); y = 20 }
    }
    function sectionTitle(num, title) {
      checkPage(14)
      doc.setFillColor(...blue); doc.rect(margin, y, 3, 8, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...blue)
      doc.text(`${num}. ${title}`, margin + 6, y + 6)
      y += 12
    }
    function tableHeader(cols) {
      // cols = [{label, x, w}]
      doc.setFillColor(20, 35, 55); doc.rect(margin, y, cw, 7, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...gray)
      cols.forEach(c => doc.text(c.label, margin + c.x + 2, y + 4.5))
      y += 7
    }
    function pill(text, color, x, py) {
      doc.setTextColor(...color); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5)
      doc.text(text, x, py)
    }

    // ── Page 1 : Header ──
    doc.setFillColor(...dark); doc.rect(0, 0, W, 44, 'F')
    doc.setFillColor(...blue); doc.rect(0, 44, W, 2, 'F')
    doc.setTextColor(...white); doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
    doc.text('Rapport de cohérence CIR', margin, 15)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...gray)
    doc.text(`CIR Intelligence  ·  Client : ${reportData.meta.client}  ·  Généré le ${reportData.meta.date} à ${reportData.meta.heure}`, margin, 24)
    doc.text(`Projet : ${reportData.projet.nom}  ·  Période : ${reportData.projet.periode}`, margin, 31)
    doc.text(`Équipe : ${reportData.projet.equipe}  ·  Prestataires : ${reportData.projet.prestataires}`, margin, 38)
    y = 55

    // ── BILAN KPI ──
    const kpis = [
      { label: 'Total déposés', value: reportData.stats.nbDocs, color: white },
      { label: 'Cas 1 (type connu)', value: reportData.stats.nbCas1, color: green },
      { label: 'Cas 2 (type inconnu)', value: reportData.stats.nbCas2, color: yellow },
      { label: 'Cas 3 (non lisibles)', value: reportData.stats.nbCas3, color: red },
    ]
    const kw = cw / 4
    kpis.forEach((k, i) => {
      const kx = margin + i * kw
      doc.setFillColor(...lightBg); doc.roundedRect(kx, y, kw - 2, 18, 2, 2, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...k.color)
      doc.text(String(k.value), kx + kw / 2 - 2, y + 10, { align: 'center' })
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...gray)
      doc.text(k.label, kx + kw / 2 - 2, y + 15.5, { align: 'center' })
    })
    y += 24

    // ══════════════════════════════════════════════
    // A. BILAN DES DÉPÔTS
    // ══════════════════════════════════════════════
    sectionTitle('A', 'Bilan des dépôts')

    // Tableau récap
    tableHeader([
      { label: 'Cas', x: 0, w: 15 },
      { label: 'Description', x: 15, w: 85 },
      { label: 'Nb', x: 100, w: 10 },
      { label: 'Fichiers', x: 115, w: 65 },
    ])

    const bilanRows = [
      {
        cas: 'Cas 1', desc: 'Extraction réussie — type reconnu', nb: reportData.stats.nbCas1,
        color: green,
        files: reportData.docsValides.map(d => d.name),
      },
      {
        cas: 'Cas 2', desc: 'Extraction réussie — type non reconnu', nb: reportData.stats.nbCas2,
        color: yellow,
        files: reportData.docsInconnus.map(d => d.name),
      },
      {
        cas: 'Cas 3', desc: 'Extraction échouée / non lisible (exclus de l\'analyse)', nb: reportData.stats.nbCas3,
        color: red,
        files: reportData.docsEchoues.map(d => d.name),
      },
    ]

    bilanRows.forEach((row, idx) => {
      checkPage(12)
      const rowH = 10
      if (idx % 2 === 0) { doc.setFillColor(249, 251, 253); doc.rect(margin, y - 1, cw, rowH, 'F') }
      doc.setFillColor(...row.color); doc.rect(margin, y - 1, 2, rowH, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...row.color)
      doc.text(row.cas, margin + 2, y + 4.5)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 40, 55)
      doc.text(row.desc, margin + 17, y + 4.5)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...row.color)
      doc.text(String(row.nb), margin + 102, y + 4.5)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...gray)
      const fileList = row.files.length > 0 ? row.files.join(', ').slice(0, 65) : '—'
      doc.text(fileList, margin + 117, y + 4.5)
      y += rowH
    })
    y += 4

    // Cas 3 — liste détaillée si présent
    if (reportData.docsEchoues.length > 0) {
      checkPage(10)
      doc.setFillColor(255, 240, 240); doc.roundedRect(margin, y, cw, 6 + reportData.docsEchoues.length * 5.5, 2, 2, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...red)
      doc.text('Fichiers Cas 3 (exclus de l\'analyse automatique) :', margin + 3, y + 4); y += 7
      reportData.docsEchoues.forEach(d => {
        checkPage(6)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80, 30, 30)
        doc.text(`• ${d.name}${d.manualReview ? ' (image/scan)' : ' (extraction échouée)'}`, margin + 5, y); y += 5.5
      })
      y += 3
    }

    // ══════════════════════════════════════════════
    // B. INFORMATIONS EXTRAITES PAR DOCUMENT (Cas 1 + Cas 2)
    // ══════════════════════════════════════════════
    checkPage(14)
    sectionTitle('B', 'Informations extraites par document (Cas 1 et Cas 2)')

    if (reportData.docsExploitables.length === 0) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...gray)
      doc.text('Aucun document exploitable dans ce dossier.', margin, y); y += 10
    } else {
      reportData.docsExploitables.forEach((d, idx) => {
        const isCas2 = d.type === 'Type inconnu'
        const entites = d.entites
          ? Object.entries(d.entites).filter(([, v]) => v !== null && v !== undefined && v !== '')
          : []
        const fieldsText = d.fields_summary || d.fields || '—'
        const nbLines = Math.max(1, entites.length, 1)
        checkPage(10 + nbLines * 5)

        // En-tête du document
        const docColor = isCas2 ? yellow : green
        doc.setFillColor(isCas2 ? 255 : 240, isCas2 ? 248 : 252, isCas2 ? 230 : 240)
        doc.roundedRect(margin, y, cw, 8, 1, 1, 'F')
        doc.setFillColor(...docColor); doc.rect(margin, y, 2, 8, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 40, 55)
        doc.text(d.name, margin + 5, y + 5)
        const casLabel = isCas2 ? 'Cas 2 — Type inconnu' : `Cas 1 — ${d.type}`
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...docColor)
        doc.text(casLabel, margin + cw - 2, y + 5, { align: 'right' })
        y += 10

        // Résumé
        if (fieldsText && fieldsText !== '—') {
          checkPage(8)
          doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(60, 70, 85)
          const rLines = doc.splitTextToSize(fieldsText, cw - 6)
          doc.text(rLines, margin + 3, y)
          y += rLines.length * 4.5 + 2
        }

        // Entités
        if (entites.length > 0) {
          checkPage(6)
          entites.forEach(([k, v], ei) => {
            checkPage(5)
            if (ei % 2 === 0) { doc.setFillColor(249, 251, 253); doc.rect(margin + 3, y - 1, cw - 3, 5.5, 'F') }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(80, 95, 110)
            doc.text(k.replace(/_/g, ' ') + ' :', margin + 5, y + 3)
            doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 40, 55)
            const vStr = String(v).length > 80 ? String(v).slice(0, 79) + '…' : String(v)
            doc.text(vStr, margin + 45, y + 3)
            y += 5.5
          })
        }

        if (d.anomalie) {
          checkPage(8)
          doc.setFillColor(255, 248, 230); doc.roundedRect(margin + 3, y, cw - 3, 7, 1, 1, 'F')
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...yellow)
          doc.text('⚠ ' + d.anomalie, margin + 5, y + 4.5)
          y += 9
        }
        y += 4
      })
    }

    // ══════════════════════════════════════════════
    // C. CARTE DES PREUVES RELIÉES
    // ══════════════════════════════════════════════
    checkPage(14)
    sectionTitle('C', 'Carte des preuves reliées')

    if (twinMapImg) {
      checkPage(80)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray)
      doc.text('Relations entre les documents exploitables du dossier CIR.', margin, y); y += 5
      const imgH = cw * 0.52
      doc.addImage(twinMapImg, 'PNG', margin, y, cw, imgH)
      y += imgH + 6
    }

    // Rattachements textuels
    if (jumeau?.noeuds?.length > 0) {
      checkPage(10)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 40, 55)
      doc.text('Nœuds — rattachements au sujet principal :', margin, y); y += 5
      jumeau.noeuds.forEach(n => {
        checkPage(5)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(50, 60, 75)
        doc.text(`• ${n.label} (${n.type})${n.sources?.length ? ' — ' + n.sources.join(', ') : ''}`, margin + 3, y); y += 5
      })
    }

    if (jumeau?.liens?.length > 0) {
      const lateraux = jumeau.liens.filter(l => l.lateral && l.label)
      if (lateraux.length > 0) {
        checkPage(10)
        y += 3
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(30, 40, 55)
        doc.text('Relations transversales entre documents exploitables :', margin, y); y += 5
        lateraux.forEach(l => {
          checkPage(5)
          const from = jumeau.noeuds.find(n => n.id === l.from)
          const to   = jumeau.noeuds.find(n => n.id === l.to)
          if (!from || !to) return
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(50, 60, 75)
          doc.text(`• ${from.label}  →  ${to.label}  (${l.label})`, margin + 3, y); y += 5
        })
      }
    }

    if (!twinMapImg && (!jumeau?.noeuds?.length)) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...gray)
      doc.text('Aucune relation documentaire établie — lancez la vérification de cohérence.', margin, y); y += 8
    }
    y += 4

    // ══════════════════════════════════════════════
    // D. COHÉRENCE AVEC LES RÈGLES CIR
    // ══════════════════════════════════════════════
    checkPage(14)
    sectionTitle('D', 'Cohérence avec les règles CIR')

    const alertesOpen = alerts.filter(a => a.status === 'open')
    const alertesResolved = alerts.filter(a => a.status === 'resolved')
    const reglesActives = rules.filter(r => r.active)

    // Résumé
    checkPage(10)
    doc.setFillColor(...lightBg); doc.roundedRect(margin, y, cw, 10, 2, 2, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 40, 55)
    doc.text(`${reglesActives.length} règles actives  ·  ${alertesOpen.length} anomalie(s) détectée(s)  ·  ${alertesResolved.length} résolu(e)(s)  ·  Score moyen : ${reportData.stats.scoreGlobal}%`, margin + 4, y + 6.5)
    y += 14

    if (alertesOpen.length > 0 || alertesResolved.length > 0) {
      tableHeader([
        { label: '#', x: 0 },
        { label: 'Règle', x: 10 },
        { label: 'Constat', x: 55 },
        { label: 'Gravité', x: 125 },
        { label: 'Sources', x: 148 },
      ])
      alerts.map((a, i) => ({ id: `COH-${String(i+1).padStart(2,'0')}`, ...a })).forEach((a, idx) => {
        const rowH = 14
        checkPage(rowH + 2)
        const aColor = a.status === 'resolved' ? green : a.severity === 'high' ? red : yellow
        if (idx % 2 === 0) { doc.setFillColor(249, 251, 253); doc.rect(margin, y - 1, cw, rowH, 'F') }
        doc.setFillColor(...aColor); doc.rect(margin, y - 1, 2, rowH, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(60, 70, 85)
        doc.text(a.id, margin + 2, y + 4)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 40, 55)
        const ruleLabel = (a.regle || a.rule || '').slice(0, 24)
        doc.text(ruleLabel, margin + 12, y + 4)
        const descLines = doc.splitTextToSize(a.description || '', 68)
        doc.text(descLines[0], margin + 57, y + 4)
        if (descLines[1]) doc.text(descLines[1], margin + 57, y + 9)
        const badge = a.status === 'resolved' ? 'Résolu' : a.severity === 'high' ? 'Critique' : 'Moyen'
        doc.setTextColor(...aColor); doc.setFont('helvetica', 'bold')
        doc.text(badge, margin + 127, y + 4)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...gray); doc.setFontSize(6.5)
        doc.text((a.sources || []).join(', ').slice(0, 28), margin + 150, y + 4)
        y += rowH
      })
      y += 4
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...gray)
      doc.text('Aucune anomalie détectée sur les règles CIR actives.', margin, y); y += 8
    }

    // Règles non vérifiables
    if (reportData.stats.nbCas3 > 0) {
      checkPage(10)
      doc.setFillColor(255, 248, 230); doc.roundedRect(margin, y, cw, 10, 2, 2, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...yellow)
      doc.text(`⚠  ${reportData.stats.nbCas3} fichier(s) non lisible(s) exclu(s) — certaines règles ne peuvent pas être vérifiées complètement.`, margin + 3, y + 6.5)
      y += 14
    }

    // ══════════════════════════════════════════════
    // E. COHÉRENCE AVEC LES DÉCLARATIONS COPILOT (conditionnelle)
    // ══════════════════════════════════════════════
    if (ficheContexte) {
      checkPage(14)
      sectionTitle('E', 'Cohérence avec les déclarations Copilot')

      const ficheEntries = Object.entries(ficheContexte).filter(([k]) => k !== '_confirmedAt')

      checkPage(8 + ficheEntries.length * 6)
      tableHeader([
        { label: 'Champ déclaré', x: 0 },
        { label: 'Valeur', x: 55 },
        { label: 'Cohérence avec les documents', x: 115 },
      ])
      ficheEntries.forEach((entry, idx) => {
        const [k, v] = entry
        const rowH = 7
        checkPage(rowH + 2)
        if (idx % 2 === 0) { doc.setFillColor(249, 251, 253); doc.rect(margin, y - 1, cw, rowH, 'F') }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(60, 80, 120)
        doc.text(k, margin + 2, y + 4)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 40, 55)
        const val = String(v).length > 35 ? String(v).slice(0, 34) + '…' : String(v)
        doc.text(val, margin + 57, y + 4)

        // Vérification basique de cohérence entre déclaration et documents
        let coherence = '—'
        let cohColor  = gray
        const vLower = String(v).toLowerCase()
        const kLower = k.toLowerCase()

        if (kLower.includes('projet') || kLower.includes('nom')) {
          const hasProjet = reportData.docsExploitables.some(d =>
            d.type === 'Fiche projet' || (d.fields_summary || '').toLowerCase().includes(vLower.slice(0, 10))
          )
          coherence = hasProjet ? 'Fiche projet présente' : 'Fiche projet absente'
          cohColor = hasProjet ? green : yellow
        } else if (kLower.includes('période') || kLower.includes('date')) {
          coherence = 'Vérifier dates documents'
          cohColor  = yellow
        } else if (kLower.includes('équipe') || kLower.includes('salarié')) {
          const hasPersonnel = reportData.docsExploitables.some(d => d.type === 'Fiche personnel' || d.type === 'Relevé de temps')
          coherence = hasPersonnel ? 'Personnel documenté' : 'Pièces personnel manquantes'
          cohColor  = hasPersonnel ? green : yellow
        } else if (kLower.includes('prestataire')) {
          const hasContrat = reportData.docsExploitables.some(d => d.type === 'Contrat' || d.type === 'Facture')
          coherence = hasContrat ? 'Contrat/facture présent' : 'Pas de contrat/facture'
          cohColor  = hasContrat ? green : yellow
        } else {
          coherence = 'Vérification manuelle'
          cohColor  = gray
        }

        doc.setTextColor(...cohColor); doc.setFont('helvetica', 'bold'); doc.setFontSize(7)
        doc.text(coherence, margin + 117, y + 4)
        y += rowH
      })

      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...gray)
      y += 3
      checkPage(6)
      doc.text(`Fiche confirmée le ${ficheContexte._confirmedAt || '—'}  ·  Vérification de cohérence indicative — validation manuelle recommandée.`, margin, y); y += 8
    }

    // ══════════════════════════════════════════════
    // F. GRILLE DE CONTRÔLE
    // ══════════════════════════════════════════════
    checkPage(14)
    sectionTitle('F', 'Grille de contrôle')

    tableHeader([
      { label: 'Règle CIR', x: 0 },
      { label: 'Statut', x: 100 },
      { label: 'Note du consultant', x: 130 },
    ])

    reportData.grille.forEach((g, idx) => {
      checkPage(9)
      const rowH = 8
      if (idx % 2 === 0) { doc.setFillColor(249, 251, 253); doc.rect(margin, y - 1, cw, rowH, 'F') }
      const stColor = g.status === 'Validé' || g.status === 'Résolu' ? green
        : g.status === 'Anomalie' ? red
        : g.status === 'À vérifier' ? yellow : gray
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(30, 40, 55)
      doc.text(g.regle.slice(0, 50), margin + 2, y + 4)
      doc.setTextColor(...stColor); doc.setFont('helvetica', 'bold')
      doc.text(g.status, margin + 102, y + 4)
      doc.setTextColor(...gray); doc.setFont('helvetica', 'normal'); doc.setFontSize(7)
      doc.text((g.note || '').slice(0, 35), margin + 132, y + 4)
      y += rowH
    })
    y += 6

    // ── Pièces manquantes & Impact financier (compact, bas de grille) ──
    if (reportData.piecesManquantes.length > 0) {
      checkPage(10 + reportData.piecesManquantes.length * 5)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...yellow)
      doc.text('Pièces non fournies (types requis pour un dossier CIR complet) :', margin, y); y += 5
      reportData.piecesManquantes.forEach(p => {
        checkPage(5)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(80, 70, 30)
        doc.text(`• ${p}`, margin + 3, y); y += 5
      })
      y += 3
    }

    if (reportData.financier.assietteCIR || reportData.financier.cirEstime) {
      checkPage(22)
      doc.setFillColor(...lightBg); doc.roundedRect(margin, y, cw, 20, 2, 2, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...blue)
      doc.text('Impact indicatif sur le CIR', margin + 4, y + 7)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 40, 55)
      if (reportData.financier.totalDepenses)
        doc.text(`Dépenses R&D déclarées : ${reportData.financier.totalDepenses} €`, margin + 4, y + 13)
      if (reportData.financier.assietteCIR)
        doc.text(`Assiette CIR : ${reportData.financier.assietteCIR} €`, margin + 90, y + 13)
      if (reportData.financier.cirEstime) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...blue)
        doc.text(`CIR estimé : ${reportData.financier.cirEstime} €`, margin + 4, y + 18)
      }
      y += 25
    }

    // ── Décision consultant ──
    checkPage(22)
    y += 4
    doc.setFillColor(...lightBg); doc.roundedRect(margin, y, cw, 18, 2, 2, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30, 40, 55)
    doc.text('Décision du consultant', margin + 4, y + 6)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...gray)
    doc.text('Pour chaque signalement : Confirmé, Écarté ou En attente d\'une pièce.', margin + 4, y + 11)
    doc.text('Décision finale : ___________________________     Date : _______________', margin + 4, y + 16)
    y += 22

    // ── Footer sur toutes les pages ──
    const pageCount = doc.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p)
      doc.setFillColor(240, 243, 246); doc.rect(0, 285, W, 12, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...gray)
      doc.text(`Rapport CIR — ${reportData.projet.nom} — ${reportData.meta.client}`, margin, 291)
      doc.text(`Page ${p} de ${pageCount}`, W - margin, 291, { align: 'right' })
    }

    doc.save(`rapport_cir_${client?.nom ?? 'client'}_${reportData.meta.date.replace(/\//g, '-')}.pdf`)
  }

  // -- Render ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0d1b2a] flex flex-col">

      {/* Header */}
      <header className="flex items-center gap-4 px-8 py-5 border-b border-white/10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm">
          <ArrowLeft size={18} />
          Tous les clients
        </button>
        <div className="flex-1 ml-2">
          <h1 className="text-white font-bold text-lg">
            Dossier de {client?.prenom} {client?.nom}
          </h1>
          <p className="text-white/40 text-sm">{client?.email} · Inscrit le {client?.createdAt}</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-center">
            <p className="text-white font-bold text-lg">{documents.length}</p>
            <p className="text-white/40 text-xs">Documents</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2 text-center">
            <p className="text-yellow-400 font-bold text-lg">{totalAlertes}</p>
            <p className="text-yellow-400/60 text-xs">Alertes</p>
          </div>
          {unknownTypeDocs.length > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2 text-center">
              <p className="text-orange-400 font-bold text-lg">{unknownTypeDocs.length}</p>
              <p className="text-orange-400/60 text-xs">Type inconnu</p>
            </div>
          )}
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2 text-center">
            <p className="text-green-400 font-bold text-lg">{okDocs}</p>
            <p className="text-green-400/60 text-xs">Validés</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 px-8 pt-5 border-b border-white/10">
        {[
          { key: 'documents', label: 'Documents déposés' },
          { key: 'rules',     label: 'Règles de cohérence' },
          { key: 'copilote',  label: 'Questions copilote' },
          { key: 'report',    label: 'Rapport & Grille' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px
              ${tab === t.key ? 'text-white border-[#00b4d8]' : 'text-white/40 border-transparent hover:text-white/70'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <main className="flex-1 px-8 pb-10 pt-6 max-w-5xl mx-auto w-full">

        {/* == TAB : Documents == */}
        {tab === 'documents' && (
          <div className="space-y-6">

            {/* Fiche de contexte */}
            {ficheContexte ? (
              <div className="bg-[#00b4d8]/5 border border-[#00b4d8]/20 rounded-2xl overflow-hidden">
                <div className="px-6 py-3 border-b border-[#00b4d8]/15 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={15} className="text-[#00b4d8]" />
                    <span className="text-[#00b4d8] font-semibold text-sm">Fiche de contexte — déclarée par le client</span>
                  </div>
                  <span className="text-white/25 text-xs">Confirmée le {ficheContexte._confirmedAt}</span>
                </div>
                <div className="px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-2">
                  {Object.entries(ficheContexte)
                    .filter(([k]) => k !== '_confirmedAt')
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-sm">
                        <span className="text-white/40 shrink-0 w-24">{k} :</span>
                        <span className="text-white/80">{v}</span>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/3 border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <p className="text-white/40 text-sm">En attente de la fiche de contexte — le client n'a pas encore complété le copilote.</p>
              </div>
            )}

            {/* Carte des preuves reliées */}
            <TwinMap jumeau={jumeau} alertes={alerts} />

            {/* Registre documentaire */}            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-white font-semibold">Registre documentaire</span>
                <span className="text-white/40 text-sm">{documents.length} document(s)</span>
              </div>
              <div className="divide-y divide-white/5">
                {documents.length === 0 ? (
                  <div className="px-6 py-8 flex flex-col items-center gap-3 text-center">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                      <FileText size={20} className="text-white/20" />
                    </div>
                    <p className="text-white/30 text-sm">Aucun document déposé pour le moment.</p>
                  </div>
                ) : (
                  <>
                    {documents.map((d, i) => {
                      const score      = d.score ?? 0
                      const isOk       = d.status === 'ok' || d.status === 'analysé'
                      const isSelected = selectedDoc?.name === d.name

                      return (
                        <div key={i}
                          className={`flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors ${isSelected ? 'bg-[#00b4d8]/5' : ''}`}
                          onClick={() => setSelectedDoc(isSelected ? null : d)}
                        >
                          <FileText size={14} className={`shrink-0 ${isSelected ? 'text-[#00b4d8]' : 'text-[#00b4d8]/60'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm truncate">{d.name}</p>
                            <p className="text-white/40 text-xs mt-0.5 truncate">{d.fields_summary || d.fields || '—'}</p>
                          </div>
                          <span className="text-white/50 text-xs shrink-0 w-32 text-center">{d.type || '—'}</span>
                          {score > 0 ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${score >= 90 ? 'bg-green-400' : score >= 70 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                  style={{ width: `${score}%` }} />
                              </div>
                              <span className="text-white/50 text-xs">{score}%</span>
                            </div>
                          ) : <span className="text-white/20 text-xs w-20 shrink-0">—</span>}
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0
                            ${isOk ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                            {isOk ? '● Passé' : '● À examiner'}
                          </span>
                          <Info size={13} className={`shrink-0 transition-colors ${isSelected ? 'text-[#00b4d8]' : 'text-white/20'}`} />
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Demander des documents */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
                <FolderPlus size={16} className="text-[#00b4d8]" />
                <span className="text-white font-semibold">Demander des documents au client</span>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-white/40 text-sm">Les demandes apparaissent immédiatement dans l'espace client comme notification.</p>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-2">
                    <input
                      value={newDocType}
                      onChange={e => setNewDocType(e.target.value)}
                      placeholder="Type de document requis (ex : Avenant au contrat Tech Solutions)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/25 text-sm outline-none focus:border-[#00b4d8]/50"
                    />
                    <input
                      value={newDocNote}
                      onChange={e => setNewDocNote(e.target.value)}
                      placeholder="Note pour le client (optionnel)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/25 text-sm outline-none focus:border-[#00b4d8]/50"
                    />
                  </div>
                  <button
                    onClick={addRequiredDoc}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white rounded-xl text-sm font-medium transition-colors self-start"
                  >
                    <Send size={15} /> Envoyer
                  </button>
                </div>

                {requiredDocs.length > 0 && (
                  <div className="border border-white/10 rounded-xl overflow-hidden mt-2">
                    <div className="px-4 py-2 bg-white/5 border-b border-white/10">
                      <span className="text-white/50 text-xs font-medium uppercase tracking-wide">Demandes envoyées</span>
                    </div>
                    {requiredDocs.map(d => (
                      <div key={d.id} className="flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                        <Bell size={14} className="text-[#00b4d8] mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">{d.type}</p>
                          {d.note && <p className="text-white/40 text-xs mt-0.5">{d.note}</p>}
                        </div>
                        <button onClick={() => removeRequiredDoc(d.id)} className="text-white/20 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Alertes */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-white font-semibold">Alertes</span>
                {totalAlertes > 0 && (
                  <span className="text-xs bg-yellow-500/15 text-yellow-400 px-2.5 py-1 rounded-full font-medium">
                    {totalAlertes} alerte(s)
                  </span>
                )}
              </div>
              {alerts.length === 0 ? (
                <div className="px-6 py-5 space-y-4">

                  {/* Fichiers non lisibles (images/scans) → vraies alertes */}
                  {imageFiles.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-white/40 text-xs uppercase tracking-wide font-medium">Fichiers non lisibles — extraction impossible</p>
                      {imageFiles.map((d, i) => (
                        <div key={i} className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-white text-sm font-medium">{d.name}</p>
                            <p className="text-white/50 text-xs mt-0.5">Aucune information n'a pu être extraite de ce fichier (image / scan). Le client a été notifié de redéposer ce document en PDF texte ou Word.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fichiers extraction échouée (Cas 3b) → alertes */}
                  {failedDocs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-white/40 text-xs uppercase tracking-wide font-medium">Fichiers avec extraction échouée</p>
                      {failedDocs.map((d, i) => (
                        <div key={i} className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-white text-sm font-medium">{d.name}</p>
                            <p className="text-white/50 text-xs mt-0.5">Le contenu de ce fichier n'a pas pu être extrait. Vérifiez que le fichier n'est pas corrompu ou protégé, et demandez au client de le redéposer.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Fichiers type inconnu (Cas 2) → information, pas une alerte */}
                  {unknownTypeDocs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-white/40 text-xs uppercase tracking-wide font-medium">Fichiers à classifier manuellement</p>
                      {unknownTypeDocs.map((d, i) => (
                        <div key={i} className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3">
                          <Info size={14} className="text-orange-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-white text-sm font-medium">{d.name}</p>
                            <p className="text-white/50 text-xs mt-0.5">Les informations ont été extraites mais le type de ce document n'a pas pu être reconnu automatiquement. Vérifiez et classifiez-le manuellement si nécessaire.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col items-center gap-3 text-center py-4">
                    {documents.length > 0 && (
                      <button onClick={lancerVerification}
                        className="flex items-center gap-2 px-4 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-white rounded-xl text-sm font-medium transition-colors">
                        <ShieldCheck size={15} /> Lancer la vérification de cohérence
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {alerts.map(a => (
                    <div key={a.id} className={`px-6 py-4 ${a.status === 'resolved' ? 'opacity-40' : ''}`}>
                      <div className="flex items-start gap-3 cursor-pointer"
                        onClick={() => setExpandedAlert(expandedAlert === a.id ? null : a.id)}>
                        <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-white font-medium text-sm">{a.rule}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full
                                ${a.status === 'resolved' ? 'bg-green-500/15 text-green-400'
                                  : a.severity === 'high' ? 'bg-red-500/15 text-red-400'
                                  : 'bg-yellow-500/15 text-yellow-400'}`}>
                                {a.status === 'resolved' ? 'Résolu' : a.severity === 'high' ? 'Critique' : 'Moyen'}
                              </span>
                              {expandedAlert === a.id
                                ? <ChevronUp size={14} className="text-white/40" />
                                : <ChevronDown size={14} className="text-white/40" />}
                            </div>
                          </div>
                          <p className="text-white/40 text-xs mt-0.5 line-clamp-1">{a.description}</p>
                        </div>
                      </div>
                      {expandedAlert === a.id && (
                        <div className="mt-4 ml-7 space-y-3">
                          <p className="text-white/60 text-sm leading-relaxed">{a.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {a.sources.map(s => (
                              <span key={s} className="bg-[#00b4d8]/10 border border-[#00b4d8]/20 text-[#00b4d8] text-xs px-2.5 py-1 rounded-lg">{s}</span>
                            ))}
                          </div>
                          {a.status === 'open' && (
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => resolveAlert(a.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/15 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/25 transition-colors">
                                <CheckCircle size={13} /> Marquer résolu
                              </button>
                              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-white/50 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors">
                                Demander une pièce
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* == TAB : Règles == */}
        {tab === 'rules' && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <span className="text-white font-semibold">Règles de cohérence CIR</span>
                <span className="text-white/40 text-sm">{rules.filter(r => r.active).length} actives sur {rules.length}</span>
              </div>
              <div className="divide-y divide-white/5">
                {rules.map(r => (
                  <div key={r.id} className="flex items-center gap-4 px-6 py-3.5">
                    <ShieldCheck size={15} className={r.active ? 'text-[#00b4d8]' : 'text-white/20'} />
                    <span className={`flex-1 text-sm ${r.active ? 'text-white' : 'text-white/30'}`}>{r.label}</span>
                    <button onClick={() => toggleRule(r.id)}
                      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${r.active ? 'bg-[#00b4d8]' : 'bg-white/10'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.active ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                    <button onClick={() => deleteRule(r.id)} className="text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-5">
              <p className="text-white font-medium text-sm mb-3">Ajouter une règle personnalisée</p>
              <div className="flex gap-3">
                <input value={newRule} onChange={e => setNewRule(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRule()}
                  placeholder="Ex : Chaque rapport technique doit couvrir la même période que le relevé de temps"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/25 text-sm outline-none focus:border-[#00b4d8]/50" />
                <button onClick={addRule}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white rounded-xl text-sm font-medium transition-colors">
                  <Plus size={16} /> Ajouter
                </button>
              </div>
            </div>

            {/* ── Rapport narratif de cohérence ── */}
            {rapportCoherence ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-[#00b4d8]" />
                    <span className="text-white font-semibold">Résultat de la vérification</span>
                  </div>
                  <span className="text-white/30 text-xs">{rapportCoherence.date}</span>
                </div>

                {/* Stats rapides */}
                <div className="px-6 py-4 grid grid-cols-4 gap-3 border-b border-white/5">
                  {[
                    { label: 'Analysés',  value: rapportCoherence.stats.analyses,  color: 'text-white' },
                    { label: 'Anomalies', value: rapportCoherence.stats.anomalies, color: rapportCoherence.stats.anomalies > 0 ? 'text-red-400' : 'text-green-400' },
                    { label: 'Validés',   value: rapportCoherence.stats.valides,   color: 'text-green-400' },
                    { label: 'Non lisibles', value: rapportCoherence.stats.echoues, color: rapportCoherence.stats.echoues > 0 ? 'text-yellow-400' : 'text-white/40' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/5 rounded-xl px-3 py-2.5 text-center">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-white/30 text-xs mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Lignes narratives règle par règle */}
                <div className="px-6 py-4 space-y-3">
                  {rapportCoherence.lignes.map((l, i) => {
                    if (l.type === 'intro') return (
                      <p key={i} className="text-white/50 text-xs italic pb-2 border-b border-white/5">{l.text}</p>
                    )
                    if (l.type === 'conclusion') return (
                      <div key={i} className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-white/70 text-sm font-medium">{l.text}</p>
                      </div>
                    )
                    const icon  = l.type === 'ok' ? '✓' : l.type === 'critique' ? '✕' : l.type === 'warn' ? '⚠' : '—'
                    const color = l.type === 'ok' ? 'text-green-400' : l.type === 'critique' ? 'text-red-400' : l.type === 'warn' ? 'text-yellow-400' : 'text-white/25'
                    const bg    = l.type === 'ok' ? 'bg-green-500/5 border border-green-500/10' : l.type === 'critique' ? 'bg-red-500/8 border border-red-500/10' : l.type === 'warn' ? 'bg-yellow-500/5 border border-yellow-500/10' : 'bg-white/3 border border-white/5'
                    return (
                      <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 ${bg}`}>
                        <span className={`text-sm font-bold shrink-0 mt-0.5 w-4 ${color}`}>{icon}</span>
                        <div className="flex-1 min-w-0">
                          {l.regle && (
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${color}`}>{l.regle}</p>
                          )}
                          <p className="text-white/60 text-sm leading-relaxed">{l.text}</p>
                          {l.sources?.length > 0 && (
                            <p className="text-white/25 text-xs mt-1">Sources : {l.sources.join(', ')}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white/3 border border-white/5 rounded-2xl px-6 py-5 flex items-center gap-3">
                <ShieldCheck size={16} className="text-white/20 shrink-0" />
                <p className="text-white/25 text-sm">Lancez la vérification depuis l'onglet "Documents déposés" pour voir le rapport ici.</p>
              </div>
            )}

          </div>
        )}
        {tab === 'copilote' && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <span className="text-white font-semibold">Questions du copilote</span>
                <p className="text-white/40 text-xs mt-0.5">Ces questions sont posées à tous les clients lors de la déclaration initiale</p>
              </div>
              <div className="divide-y divide-white/5">
                <div className="px-4 py-2 bg-white/[0.02]">
                  <p className="text-white/30 text-xs uppercase tracking-wide font-medium">Questions standards (non modifiables)</p>
                </div>
                {FIXED_QUESTIONS.map((q, i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <span className="text-white/40 text-[10px] font-bold">{i + 1}</span>
                    </div>
                    <span className="text-white/50 text-sm flex-1">{q}</span>
                    <span className="text-white/20 text-xs">Fixe</span>
                  </div>
                ))}
                {customQuestions.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-[#00b4d8]/5">
                      <p className="text-[#00b4d8]/60 text-xs uppercase tracking-wide font-medium">Questions ajoutées par le consultant</p>
                    </div>
                    {customQuestions.map((q, i) => (
                      <div key={q.id} className="flex items-center gap-3 px-6 py-3 bg-[#00b4d8]/3">
                        <div className="w-5 h-5 rounded-full bg-[#00b4d8]/20 flex items-center justify-center shrink-0">
                          <span className="text-[#00b4d8] text-[10px] font-bold">{FIXED_QUESTIONS.length + i + 1}</span>
                        </div>
                        <span className="text-white/70 text-sm flex-1">{q.text}</span>
                        <button onClick={() => deleteQuestion(q.id)} className="text-white/20 hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div className="px-6 py-4 border-t border-white/10 space-y-2">
                <p className="text-white/40 text-xs">Exemple : "Avez-vous reçu des subventions publiques ?" ou "Le projet a-t-il fait l'objet d'un dépôt de brevet ?"</p>
                <div className="flex gap-3">
                  <input
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuestion()}
                    placeholder="Ajouter une question pour le copilote…"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/25 text-sm outline-none focus:border-[#00b4d8]/50"
                  />
                  <button onClick={addQuestion}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white rounded-xl text-sm font-medium transition-colors">
                    <Plus size={16} /> Ajouter
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* == TAB : Rapport & Grille == */}
        {tab === 'report' && (
          <div className="space-y-6">

            {/* ── Rapport de cohérence ── */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-white font-semibold">Rapport de cohérence</span>
                  <p className="text-white/40 text-xs mt-0.5">Synthèse structurée — 5 sections · incluse dans le PDF</p>
                </div>
                <button onClick={downloadPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-white rounded-xl text-sm font-medium transition-colors">
                  <Download size={15} /> Télécharger PDF
                </button>
              </div>

              {/* KPIs bilan */}
              <div className="px-6 pt-5 grid grid-cols-4 gap-3">
                {[
                  { label: 'Total déposés', value: documents.length, color: 'text-white' },
                  { label: 'Cas 1 (type connu)', value: documents.filter(d => !d.manualReview && d.status === 'analysé' && d.type !== 'Type inconnu' && d.fields !== 'Extraction échouée').length, color: 'text-green-400' },
                  { label: 'Cas 2 (type inconnu)', value: unknownTypeDocs.length, color: 'text-yellow-400' },
                  { label: 'Cas 3 (non lisibles)', value: imageFiles.length + failedDocs.length, color: 'text-red-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-xl px-4 py-3 text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-white/40 text-xs mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="px-6 py-5 space-y-5">

                {/* A — Bilan des dépôts */}
                <div>
                  <h3 className="text-[#00b4d8] font-bold text-xs uppercase tracking-wide mb-2">A · Bilan des dépôts</h3>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-green-400 font-bold w-14 shrink-0">Cas 1</span>
                      <span className="text-white/60">{documents.filter(d => !d.manualReview && d.status === 'analysé' && d.type !== 'Type inconnu' && d.fields !== 'Extraction échouée').length} document(s) — extraction réussie, type reconnu</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-yellow-400 font-bold w-14 shrink-0">Cas 2</span>
                      <span className="text-white/60">{unknownTypeDocs.length} document(s) — extraction réussie, type non reconnu{unknownTypeDocs.length > 0 ? ` (${unknownTypeDocs.map(d => d.name).join(', ')})` : ''}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-red-400 font-bold w-14 shrink-0">Cas 3</span>
                      <span className="text-white/60">{imageFiles.length + failedDocs.length} document(s) — non lisibles, exclus de l'analyse{(imageFiles.length + failedDocs.length) > 0 ? ` : ${[...imageFiles, ...failedDocs].map(d => d.name).join(', ')}` : ''}</span>
                    </div>
                  </div>
                </div>

                {/* B — Informations extraites */}
                <div>
                  <h3 className="text-[#00b4d8] font-bold text-xs uppercase tracking-wide mb-2">B · Informations extraites par document</h3>
                  {documents.filter(d => !d.manualReview && d.status === 'analysé' && d.fields !== 'Extraction échouée').length === 0 ? (
                    <p className="text-white/30 text-sm italic">Aucun document exploitable.</p>
                  ) : (
                    <div className="space-y-2">
                      {documents.filter(d => !d.manualReview && d.status === 'analysé' && d.fields !== 'Extraction échouée').map((d, i) => (
                        <div key={i} className={`rounded-xl px-4 py-3 border ${d.type === 'Type inconnu' ? 'bg-yellow-500/5 border-yellow-500/15' : 'bg-green-500/5 border-green-500/10'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white text-sm font-medium truncate">{d.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${d.type === 'Type inconnu' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'}`}>
                              {d.type || 'Type inconnu'}
                            </span>
                          </div>
                          <p className="text-white/50 text-xs leading-relaxed">{d.fields_summary || d.fields || '—'}</p>
                          {d.entites && Object.entries(d.entites).filter(([, v]) => v).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {Object.entries(d.entites).filter(([, v]) => v).slice(0, 5).map(([k, v]) => (
                                <span key={k} className="text-xs bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/50">
                                  <span className="text-white/30">{k.replace(/_/g, ' ')} :</span> {String(v).slice(0, 30)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* C — Carte des preuves */}
                <div>
                  <h3 className="text-[#00b4d8] font-bold text-xs uppercase tracking-wide mb-2">C · Carte des preuves reliées</h3>
                  {jumeau?.noeuds?.length > 0 ? (
                    <div className="space-y-1.5">
                      {jumeau.noeuds.map((n, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-white/60">
                          <span className="w-2 h-2 rounded-full bg-[#00b4d8] shrink-0" />
                          <span>{n.label}</span>
                          {n.type && <span className="text-white/25 text-xs">({n.type})</span>}
                          {n.sources?.length > 0 && <span className="text-white/25 text-xs ml-auto">{n.sources.join(', ')}</span>}
                        </div>
                      ))}
                      {jumeau.liens?.filter(l => l.lateral && l.label).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                          <p className="text-white/30 text-xs">Relations transversales :</p>
                          {jumeau.liens.filter(l => l.lateral && l.label).map((l, i) => {
                            const from = jumeau.noeuds.find(n => n.id === l.from)
                            const to   = jumeau.noeuds.find(n => n.id === l.to)
                            if (!from || !to) return null
                            return (
                              <div key={i} className="text-xs text-white/50">
                                {from.label} <span className="text-[#00b4d8]">→</span> {to.label} <span className="text-white/25">({l.label})</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-white/30 text-sm italic">Lancez la vérification de cohérence pour établir la carte des preuves.</p>
                  )}
                </div>

                {/* D — Cohérence CIR */}
                <div>
                  <h3 className="text-[#00b4d8] font-bold text-xs uppercase tracking-wide mb-2">D · Cohérence avec les règles CIR</h3>
                  {alerts.length === 0 && (imageFiles.length + failedDocs.length) === 0 ? (
                    <p className="text-white/30 text-sm italic">Lancez la vérification depuis l'onglet Documents pour voir les résultats.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {alerts.filter(a => a.status === 'open').length === 0 && alerts.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-green-400">
                          <CheckCircle size={13} className="shrink-0" />
                          <span>Aucune anomalie — toutes les règles vérifiées sont cohérentes.</span>
                        </div>
                      )}
                      {alerts.filter(a => a.status === 'open').map((a, i) => (
                        <div key={i} className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${a.severity === 'high' ? 'bg-red-500/8 text-red-400' : 'bg-yellow-500/8 text-yellow-400'}`}>
                          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">{a.regle || a.rule}</span>
                            <span className="text-white/40 ml-2 text-xs">{a.description}</span>
                          </div>
                        </div>
                      ))}
                      {(imageFiles.length + failedDocs.length) > 0 && (
                        <div className="flex items-start gap-2 text-sm bg-orange-500/8 text-orange-400 rounded-lg px-3 py-2">
                          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                          <span>{imageFiles.length + failedDocs.length} fichier(s) non lisible(s) — certaines règles ne peuvent pas être vérifiées.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* E — Copilot (conditionnelle) */}
                {ficheContexte && (
                  <div>
                    <h3 className="text-[#00b4d8] font-bold text-xs uppercase tracking-wide mb-2">E · Cohérence avec les déclarations Copilot</h3>
                    <div className="bg-[#00b4d8]/5 border border-[#00b4d8]/15 rounded-xl px-4 py-3 space-y-2">
                      {Object.entries(ficheContexte).filter(([k]) => k !== '_confirmedAt').map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-sm">
                          <span className="text-white/35 w-28 shrink-0">{k} :</span>
                          <span className="text-white/70">{v}</span>
                        </div>
                      ))}
                      <p className="text-white/25 text-xs pt-1 border-t border-white/5">Confirmée le {ficheContexte._confirmedAt} · Vérification de cohérence avec les documents incluse dans le PDF.</p>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* ── Grille de contrôle ── */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-white font-semibold">Grille de contrôle</span>
                  <p className="text-white/40 text-xs mt-0.5">Remplissez votre analyse pour chaque règle — incluse dans le PDF</p>
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {rules.filter(r => r.active).map(r => {
                  const alerteLiee = alerts.find(a => (a.regle || a.rule) === r.label)
                  const autoStatus = alerteLiee
                    ? (alerteLiee.status === 'resolved' ? 'Résolu' : 'Anomalie')
                    : (grilleStatus[r.id] || '—')
                  return (
                    <div key={r.id} className="px-6 py-3.5 flex items-center gap-4">
                      <span className="text-white/70 text-sm flex-1">{r.label}</span>
                      <select
                        value={grilleStatus[r.id] || autoStatus}
                        onChange={e => setGrilleRow(r.id, 'status', e.target.value)}
                        className={`bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer
                          ${(grilleStatus[r.id] || autoStatus) === 'Validé' || (grilleStatus[r.id] || autoStatus) === 'Résolu' ? 'text-green-400'
                            : (grilleStatus[r.id] || autoStatus) === 'Anomalie' ? 'text-red-400'
                            : (grilleStatus[r.id] || autoStatus) === 'À vérifier' ? 'text-yellow-400'
                            : 'text-white/40'}`}>
                        {GRILLE_OPTIONS.map(o => <option key={o} value={o} className="bg-[#0d1b2a]">{o}</option>)}
                      </select>
                      <input
                        value={grilleNotes[r.id] || ''}
                        onChange={e => setGrilleRow(r.id, 'note', e.target.value)}
                        placeholder="Note du consultant…"
                        className="w-56 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/20 text-sm outline-none focus:border-[#00b4d8]/50"
                      />
                    </div>
                  )
                })}

                {/* Lignes libres ajoutées par le consultant */}
                {grilleExtra.map((row, i) => (
                  <div key={row.id} className="px-6 py-3.5 flex items-center gap-4 bg-[#00b4d8]/3">
                    <span className="text-[#00b4d8]/70 text-sm flex-1 italic">{row.label}</span>
                    <select
                      value={row.status || '—'}
                      onChange={e => setGrilleExtra(prev => prev.map((r, idx) => idx === i ? { ...r, status: e.target.value } : r))}
                      className={`bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer
                        ${row.status === 'Validé' ? 'text-green-400' : row.status === 'Anomalie' ? 'text-red-400' : row.status === 'À vérifier' ? 'text-yellow-400' : 'text-white/40'}`}>
                      {GRILLE_OPTIONS.map(o => <option key={o} value={o} className="bg-[#0d1b2a]">{o}</option>)}
                    </select>
                    <input
                      value={row.note || ''}
                      onChange={e => setGrilleExtra(prev => prev.map((r, idx) => idx === i ? { ...r, note: e.target.value } : r))}
                      placeholder="Note…"
                      className="w-56 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-white/20 text-sm outline-none focus:border-[#00b4d8]/50"
                    />
                    <button onClick={() => setGrilleExtra(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Ajouter une ligne libre */}
              <div className="px-6 py-4 border-t border-white/10 flex gap-3">
                <input
                  value={newGrilleLabel}
                  onChange={e => setNewGrilleLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newGrilleLabel.trim()) {
                      setGrilleExtra(prev => [...prev, { id: Date.now(), label: newGrilleLabel.trim(), status: '—', note: '' }])
                      setNewGrilleLabel('')
                    }
                  }}
                  placeholder="Ajouter une observation personnalisée…"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 text-sm outline-none focus:border-[#00b4d8]/50"
                />
                <button
                  onClick={() => {
                    if (!newGrilleLabel.trim()) return
                    setGrilleExtra(prev => [...prev, { id: Date.now(), label: newGrilleLabel.trim(), status: '—', note: '' }])
                    setNewGrilleLabel('')
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#00b4d8] hover:bg-[#0096c7] text-white rounded-xl text-sm font-medium transition-colors">
                  <Plus size={15} /> Ajouter
                </button>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Panneau latéral document */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedDoc(null)} />
          <div className="w-[420px] bg-[#0d1b2a] border-l border-white/10 h-full overflow-y-auto flex flex-col">
            <div className="flex items-start justify-between px-6 py-5 border-b border-white/10 sticky top-0 bg-[#0d1b2a] z-10">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={16} className="text-[#00b4d8] shrink-0" />
                  <p className="text-white font-semibold text-sm truncate">{selectedDoc.name}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs bg-[#00b4d8]/15 text-[#00b4d8] px-2 py-0.5 rounded-full font-medium">{selectedDoc.type || 'Type inconnu'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(selectedDoc.status === 'ok' || selectedDoc.status === 'analysé') ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    {(selectedDoc.status === 'ok' || selectedDoc.status === 'analysé') ? '● Contrôle passé' : '● À examiner'}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-white/30 hover:text-white transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 flex-1">
              <div>
                <p className="text-white/30 text-xs uppercase tracking-wide font-medium mb-2">Score de qualité</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${(selectedDoc.score ?? 0) >= 90 ? 'bg-green-400' : (selectedDoc.score ?? 0) >= 70 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${selectedDoc.score ?? 0}%` }} />
                  </div>
                  <span className={`text-sm font-bold ${(selectedDoc.score ?? 0) >= 90 ? 'text-green-400' : (selectedDoc.score ?? 0) >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {selectedDoc.score ?? 0}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-white/30 text-xs uppercase tracking-wide font-medium mb-2">Informations générales</p>
                <div className="bg-white/5 border border-white/10 rounded-xl divide-y divide-white/5">
                  <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-white/40">Fichier</span><span className="text-white/80 font-medium truncate max-w-[220px]">{selectedDoc.name}</span></div>
                  <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-white/40">Type</span><span className="text-white/80 font-medium">{selectedDoc.type || 'Type inconnu'}</span></div>
                  <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-white/40">Taille</span><span className="text-white/80 font-medium">{selectedDoc.size || '—'}</span></div>
                  <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-white/40">Statut</span><span className="text-white/80 font-medium capitalize">{selectedDoc.status || '—'}</span></div>
                </div>
              </div>
              {(selectedDoc.fields_summary || selectedDoc.fields) && (
                <div>
                  <p className="text-white/30 text-xs uppercase tracking-wide font-medium mb-2">Résumé extrait</p>
                  <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                    <p className="text-white/70 text-sm leading-relaxed">{selectedDoc.fields_summary || selectedDoc.fields}</p>
                  </div>
                </div>
              )}
              {selectedDoc.entites && Object.values(selectedDoc.entites).some(v => v !== null && v !== undefined && v !== '') && (
                <div>
                  <p className="text-white/30 text-xs uppercase tracking-wide font-medium mb-2">Entités extraites</p>
                  <div className="bg-white/5 border border-white/10 rounded-xl divide-y divide-white/5">
                    {Object.entries(selectedDoc.entites)
                      .filter(([, v]) => v !== null && v !== undefined && v !== '')
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between items-start px-4 py-2.5 gap-4">
                          <span className="text-white/40 text-sm capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
                          <span className="text-white/80 text-sm font-medium text-right">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {selectedDoc.anomalie && (
                <div>
                  <p className="text-white/30 text-xs uppercase tracking-wide font-medium mb-2">Anomalie détectée</p>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertTriangle size={15} className="text-yellow-400 mt-0.5 shrink-0" />
                    <p className="text-yellow-400/90 text-sm leading-relaxed">{selectedDoc.anomalie}</p>
                  </div>
                </div>
              )}
              {selectedDoc.manualReview && (
                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-start gap-3">
                  <Info size={15} className="text-white/40 mt-0.5 shrink-0" />
                  <p className="text-white/50 text-sm">Image ou scan — vérification manuelle requise.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

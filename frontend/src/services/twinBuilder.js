// ── Jumeau documentaire — construction et vérification des règles ─────────────
// Zéro appel API — tout en JavaScript pur

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str) {
  if (!str) return ''
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim()
}

function similar(a, b) {
  if (!a || !b) return false
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  return false
}

function getE(doc, key) {
  return doc?.entites?.[key] ?? null
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

// Détermine le rôle d'un document vis-à-vis du projet central
function getRoleLabel(doc) {
  const t = doc.type
  if (t === 'Fiche projet')      return 'CADRE & PROTOCOLE'
  if (t === 'Rapport technique') return 'ÉVALUATION / RÉSULTATS'
  if (t === 'Relevé de temps')   return 'IMPUTATION DE TEMPS'
  if (t === 'Bulletin de paie')  return 'COÛT PERSONNEL'
  if (t === 'Fiche personnel')   return 'RESSOURCE HUMAINE'
  if (t === 'Contrat')           return 'ENGAGEMENT CONTRACTUEL'
  if (t === 'Facture')           return 'DÉPENSE / PAIEMENT'
  if (t === 'Tableau financier') return 'BUDGET R&D'
  // Type inconnu : on tente de déduire un rôle depuis les entités
  if (doc.fields_summary) {
    const s = doc.fields_summary.toLowerCase()
    if (s.includes('paiement') || s.includes('virement') || s.includes('montant'))
      return 'FINANCEMENT R&D'
    if (s.includes('rapport') || s.includes('résultat') || s.includes('technique'))
      return 'DOCUMENT TECHNIQUE'
    if (s.includes('contrat') || s.includes('prestation'))
      return 'DOCUMENT CONTRACTUEL'
  }
  return 'DOCUMENT ASSOCIÉ'
}

// Sous-titre affiché sous le nom du fichier dans le nœud
function getSublabel(doc) {
  const t = doc.type
  if (t === 'Fiche projet')      return 'Fiche projet'
  if (t === 'Rapport technique') return 'Rapport technique'
  if (t === 'Relevé de temps')   return 'Relevé de temps'
  if (t === 'Bulletin de paie')  return 'Bulletin de paie'
  if (t === 'Fiche personnel')   return 'Fiche personnel'
  if (t === 'Contrat')           return 'Contrat'
  if (t === 'Facture')           return 'Facture'
  if (t === 'Tableau financier') return 'Tableau financier'
  return 'Type inconnu'
}

// Extrait un résumé court pour l'étiquette du lien vers le centre
function getLinkDetail(doc) {
  const t = doc.type
  if (t === 'Relevé de temps') {
    const nom    = getE(doc, 'salarie_nom') || getE(doc, 'salarie_prenom')
    const heures = getE(doc, 'heures_totales')
    if (nom && heures) return `${heures}h ${nom}`
    if (heures) return `${heures}h`
    if (nom) return nom
  }
  if (t === 'Facture') {
    const montant  = getE(doc, 'montant_ht') || getE(doc, 'montant_ttc')
    const emetteur = getE(doc, 'emetteur')
    if (montant && emetteur) return `${emetteur} (${montant} €)`
    if (montant) return `${montant} €`
  }
  if (t === 'Contrat') {
    const prest = getE(doc, 'prestataire')
    return prest || null
  }
  if (t === 'Rapport technique') {
    const titre = getE(doc, 'titre')
    return titre ? titre.slice(0, 30) : null
  }
  if (t === 'Fiche projet') {
    const periode = getE(doc, 'periode_debut')
    return periode ? `Période ${periode}` : null
  }
  // Type inconnu : extraire montant si présent
  if (doc.fields_summary) {
    const m = doc.fields_summary.match(/[\d\s]+€/)
    if (m) return m[0].trim()
  }
  return null
}

// ── Construction du jumeau ────────────────────────────────────────────────────

export function buildTwin(documents, fiche) {
  const noeuds = []
  const liens  = []

  // Périmètre : inclure tous les docs dont l'extraction a réussi
  // = pas d'image/scan (manualReview) ET pas d'échec total (fields_summary non vide ou score > 0)
  const extractedDocs = documents.filter(d =>
    !d.manualReview &&
    (d.score ?? 0) > 0
  )

  if (extractedDocs.length === 0) return { noeuds: [], liens: [] }

  // ── 1. Nœud central — Projet ──────────────────────────────────────────────
  let projetNom = fiche?.Projet || fiche?.projet || null
  if (!projetNom) {
    const ficheProj = extractedDocs.find(d => d.type === 'Fiche projet')
    projetNom = getE(ficheProj, 'nom_projet') || 'Projet R&D'
  }

  const projetNode = {
    id:       'projet_central',
    type:     'projet',
    label:    projetNom,
    sublabel: 'Opération R&D',
    sources:  extractedDocs.map(d => d.name),
    statut:   'central',
    entites:  {},
  }
  noeuds.push(projetNode)

  // ── 2. Un nœud par document extrait ──────────────────────────────────────
  const docNodes = extractedDocs.map(doc => {
    const node = {
      id:            'doc_' + uid(),
      type:          'document',
      docType:       doc.type,
      fileName:      doc.name,
      label:         doc.name,          // nom du fichier affiché
      sublabel:      getSublabel(doc),  // type affiché dessous
      roleLabel:     getRoleLabel(doc), // étiquette du lien vers le centre
      linkDetail:    getLinkDetail(doc),// détail optionnel sur le lien
      sources:       [doc.name],
      entites:       doc.entites || {},
      fields_summary: doc.fields_summary || doc.fields || '',
      score:         doc.score ?? 0,
      statut:        (doc.score ?? 0) >= 70 ? 'ok' : 'warn',
    }
    return { node, doc }
  })

  docNodes.forEach(({ node }) => noeuds.push(node))

  // ── 3. Liens vers le centre (avec rôle + détail) ──────────────────────────
  docNodes.forEach(({ node }) => {
    const detail = node.linkDetail
    liens.push({
      from:    node.id,
      to:      projetNode.id,
      label:   node.roleLabel + (detail ? `\n(${detail})` : ''),
      lateral: false,
      toCenter: true,
    })
  })

  // ── 4. Liens transversaux entre documents ────────────────────────────────
  // On compare les paires de documents pour détecter des entités communes

  for (let i = 0; i < docNodes.length; i++) {
    for (let j = i + 1; j < docNodes.length; j++) {
      const { node: na, doc: da } = docNodes[i]
      const { node: nb, doc: db } = docNodes[j]

      const sharedLabels = []

      // Même projet mentionné
      const projetA = getE(da, 'projet') || getE(da, 'nom_projet')
      const projetB = getE(db, 'projet') || getE(db, 'nom_projet')
      if (projetA && projetB && similar(projetA, projetB))
        sharedLabels.push('R&D - ' + projetA.slice(0, 20))

      // Même organisation / employeur / émetteur / entreprise
      const orgA = getE(da, 'employeur') || getE(da, 'entreprise') || getE(da, 'emetteur') || getE(da, 'client')
      const orgB = getE(db, 'employeur') || getE(db, 'entreprise') || getE(db, 'emetteur') || getE(db, 'client')
      if (orgA && orgB && similar(orgA, orgB) && !sharedLabels.some(l => l.includes(orgA.slice(0,8))))
        sharedLabels.push(orgA.slice(0, 22))

      // Même personne (salarié / auteur)
      const nomA = getE(da, 'salarie_nom') || getE(da, 'nom') || getE(da, 'auteur')
      const nomB = getE(db, 'salarie_nom') || getE(db, 'nom') || getE(db, 'auteur')
      if (nomA && nomB && similar(nomA, nomB) && !sharedLabels.some(l => l.includes(nomA.slice(0,6))))
        sharedLabels.push(nomA.slice(0, 20))

      // Même période
      const perA = getE(da, 'periode_debut') || getE(da, 'periode')
      const perB = getE(db, 'periode_debut') || getE(db, 'periode')
      if (perA && perB && similar(perA, perB) && sharedLabels.length === 0)
        sharedLabels.push('Période ' + perA)

      // Lien financier : prestataire ↔ émetteur ou destinataire
      const prestA = getE(da, 'prestataire') || getE(da, 'destinataire')
      const prestB = getE(db, 'prestataire') || getE(db, 'destinataire')
      const emA    = getE(da, 'emetteur')
      const emB    = getE(db, 'emetteur')
      if ((prestA && emB && similar(prestA, emB)) || (prestB && emA && similar(prestB, emA))) {
        const label = 'Financement R&D'
        if (!sharedLabels.includes(label)) sharedLabels.push(label)
      }

      if (sharedLabels.length > 0) {
        liens.push({
          from:    na.id,
          to:      nb.id,
          label:   sharedLabels[0], // label principal
          lateral: true,
          toCenter: false,
        })
      }
    }
  }

  return { noeuds, liens }
}

// ── Vérification des règles de cohérence ──────────────────────────────────────

export function checkRules(documents, jumeau, fiche) {
  const alertes = []
  let alertId = 1

  function alerte(regle, severity, description, sources) {
    alertes.push({ id: alertId++, regle, severity, description, sources, status: 'open' })
  }

  const byType = (type) => documents.filter(d => d.type === type)

  // ── Règle 1 — Temps et personnel ──
  byType('Relevé de temps').forEach(releve => {
    const nomReleve    = getE(releve, 'salarie_nom')
    const projetReleve = getE(releve, 'projet')

    byType('Fiche personnel').forEach(ficheP => {
      const nomFiche    = getE(ficheP, 'nom')
      const affectFiche = getE(ficheP, 'affectation')

      if (similar(nomReleve, nomFiche)) {
        if (affectFiche && projetReleve && !similar(affectFiche, projetReleve)) {
          alerte(
            'Temps et personnel',
            'high',
            `${nomReleve} est rattaché à "${projetReleve}" dans le relevé de temps, mais la fiche personnel indique une affectation à "${affectFiche}".`,
            [releve.name, ficheP.name]
          )
        }
      }
    })

    if (fiche && (fiche.Équipe || fiche.equipe)) {
      const equipe = fiche.Équipe || fiche.equipe || ''
      const noms = equipe.split(',').map(e => e.split('(')[0].trim())
      if (nomReleve && !noms.some(n => similar(n, nomReleve))) {
        alerte(
          'Salarié non déclaré',
          'medium',
          `${nomReleve} apparaît dans le relevé de temps mais n'a pas été déclaré dans la fiche de contexte du copilote.`,
          [releve.name]
        )
      }
    }
  })

  // ── Règle 2 — Contrat et facture ──
  byType('Facture').forEach(facture => {
    const emetteurFact = getE(facture, 'emetteur')
    const montantFact  = getE(facture, 'montant_ht')

    byType('Contrat').forEach(contrat => {
      const prestContrat = getE(contrat, 'prestataire')
      const plafond      = getE(contrat, 'montant_max')

      if (similar(emetteurFact, prestContrat)) {
        if (montantFact && plafond && Number(montantFact) > Number(plafond)) {
          alerte(
            'Contrat et facture',
            'high',
            `La facture ${emetteurFact} (${montantFact} € HT) dépasse le plafond du contrat (${plafond} €). Un avenant est nécessaire.`,
            [facture.name, contrat.name]
          )
        }
      } else if (emetteurFact && prestContrat && !similar(emetteurFact, prestContrat)) {
        alerte(
          'Contrat et facture',
          'medium',
          `La facture est émise par "${emetteurFact}" mais le contrat est avec "${prestContrat}". Vérifiez la correspondance.`,
          [facture.name, contrat.name]
        )
      }
    })
  })

  // ── Règle 3 — Période cohérente ──
  const ficheProjet = byType('Fiche projet')[0]
  const debutProjet = getE(ficheProjet, 'periode_debut') || (fiche?.Période?.split('–')?.[0]?.trim())
  const finProjet   = getE(ficheProjet, 'periode_fin')   || (fiche?.Période?.split('–')?.[1]?.trim())

  if (debutProjet && finProjet) {
    byType('Relevé de temps').forEach(releve => {
      const periodeReleve = getE(releve, 'periode_debut')
      if (periodeReleve && periodeReleve < debutProjet) {
        alerte(
          'Cohérence des dates',
          'medium',
          `Le relevé de temps "${releve.name}" couvre une période (${periodeReleve}) antérieure au début du projet (${debutProjet}).`,
          [releve.name, ficheProjet?.name].filter(Boolean)
        )
      }
    })
  }

  // ── Règle 4 — Prestataire déclaré vs documents ──
  if (fiche && fiche.Prestataires && fiche.Prestataires !== 'Aucun') {
    const prestDeclares = fiche.Prestataires.split(',').map(e => e.split('(')[0].trim())
    byType('Facture').forEach(facture => {
      const emetteur = getE(facture, 'emetteur')
      if (emetteur && !prestDeclares.some(p => similar(p, emetteur))) {
        alerte(
          'Prestataire non déclaré',
          'medium',
          `La facture de "${emetteur}" n'a pas été déclarée dans la fiche de contexte du copilote.`,
          [facture.name]
        )
      }
    })
  }

  // ── Règle 5 — Salaire cohérent ──
  byType('Bulletin de paie').forEach(bulletin => {
    const salaire     = getE(bulletin, 'salaire_brut')
    const budget      = byType('Tableau financier')[0]
    const totalBudget = getE(budget, 'total_depenses')

    if (salaire && totalBudget) {
      const annuel = Number(salaire) * 12
      if (annuel > Number(totalBudget) * 0.9) {
        alerte(
          'Salaire et budget',
          'medium',
          `Le salaire annuel estimé (${salaire} € × 12 = ${annuel} €) représente plus de 90% du budget R&D total (${totalBudget} €). Vérifiez la cohérence.`,
          [bulletin.name, budget?.name].filter(Boolean)
        )
      }
    }
  })

  // ── Règle 6 — Temps contemporain ──
  byType('Relevé de temps').forEach(releve => {
    const anomalie = releve.anomalie || ''
    if (anomalie.toLowerCase().includes('identique') ||
        anomalie.toLowerCase().includes('uniforme') ||
        anomalie.toLowerCase().includes('reconstitu')) {
      alerte(
        'Temps contemporain',
        'medium',
        `Le relevé de temps "${releve.name}" présente des entrées suspectes (${anomalie}). Ce type de relevé peut être signalé lors d'un contrôle fiscal.`,
        [releve.name]
      )
    }
  })

  return alertes
}

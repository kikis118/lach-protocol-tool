import { forwardRef, useImperativeHandle, useState } from 'react'
import { pickImage, uploadTeamLogo, updateTeamName } from '../../api'
import { Panel, Field, ScreenHeader, SelectInput, TextInput, PrimaryButton, SecondaryButton, ErrorText, SuccessText } from './AdminUI'

// One screen for editing an existing team's basic info (name, logo) -
// previously two separate tabs ("Komandas nosaukums"/"Komandas logo"),
// merged per explicit ask since both are just "edit this team" and don't
// need separate entry points. Deliberately does NOT include adding/
// removing a team from a season - that's not something WordPress's data
// model can toggle today (a team's season/tournament membership is
// derived purely from which games reference it, there's no separate
// "roster of teams in this season" to edit - see the roadmap memory note
// for what building that for real would take). Team creation stays out of
// scope entirely, same as before.
const TeamEditor = forwardRef(function TeamEditor({ lookups, onCancel, initialTeamId }, ref) {
  const teams = lookups?.teams || []
  const teamDetails = lookups?.teamDetails || {}

  const [teamId, setTeamId] = useState(initialTeamId || '')
  const [name, setName] = useState(initialTeamId ? teams.find((t) => String(t.id) === String(initialTeamId))?.name || '' : '')
  const [filePath, setFilePath] = useState(null)
  const [error, setError] = useState(null)
  const [nameSaveState, setNameSaveState] = useState('idle')
  const [logoSaveState, setLogoSaveState] = useState('idle')

  const currentName = teams.find((t) => String(t.id) === String(teamId))?.name || ''
  const currentLogo = teamId ? teamDetails[teamId]?.logo_url : null
  const canSaveName = teamId && name.trim() && name.trim() !== currentName

  // `lookups` is a snapshot fetched once when the app opened and never
  // refreshed, so `currentName` still looks "different" immediately after
  // a successful name save - each half's own saveState overrides that
  // half back to not-dirty once it's actually saved.
  const isDirty = (nameSaveState !== 'saved' && canSaveName) || (logoSaveState !== 'saved' && Boolean(filePath))
  useImperativeHandle(ref, () => ({ isDirty: () => isDirty }))

  function pickTeam(id) {
    setTeamId(id)
    setName(teams.find((t) => String(t.id) === String(id))?.name || '')
    setFilePath(null)
    setNameSaveState('idle')
    setLogoSaveState('idle')
    setError(null)
  }

  async function handleSaveName() {
    setNameSaveState('saving')
    setError(null)
    try {
      await updateTeamName({ teamId, name: name.trim() })
      setNameSaveState('saved')
    } catch (err) {
      setNameSaveState('failed')
      setError(err.message)
    }
  }

  async function handlePickLogo() {
    const path = await pickImage()
    if (path) setFilePath(path)
  }

  async function handleSaveLogo() {
    setLogoSaveState('saving')
    setError(null)
    try {
      await uploadTeamLogo({ teamId, filePath })
      setLogoSaveState('saved')
    } catch (err) {
      setLogoSaveState('failed')
      setError(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <ScreenHeader title="Rediģēt komandas" subtitle="Mainīt esošas komandas nosaukumu vai logo." onCancel={onCancel} />

      <Panel>
        <Field label="Komanda">
          <SelectInput value={teamId} onChange={pickTeam}>
            <option value="">Izvēlies...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      </Panel>

      {teamId && (
        <>
          <Panel>
            <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Nosaukums</h3>
            <Field label="Nosaukums">
              <TextInput value={name} onChange={setName} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={handleSaveName} disabled={!canSaveName || nameSaveState === 'saving'}>
                {nameSaveState === 'saving' ? 'Saglabā...' : 'Saglabāt nosaukumu'}
              </PrimaryButton>
              {nameSaveState === 'saved' && <SuccessText>Saglabāts!</SuccessText>}
            </div>
          </Panel>

          <Panel>
            <h3 className="text-sm font-black uppercase text-ink-faint tracking-wide">Logo</h3>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Pašreizējais</p>
                {currentLogo ? (
                  <img
                    src={currentLogo}
                    alt=""
                    className="w-20 h-20 object-contain bg-surface border border-line-strong rounded-md"
                  />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center bg-surface border border-line-strong rounded-md text-ink-faint text-xs">
                    nav
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-faint font-semibold mb-1">Jaunais</p>
                {filePath ? (
                  <img
                    src={`file://${filePath}`}
                    alt=""
                    className="w-20 h-20 object-contain bg-surface border border-line-strong rounded-md"
                  />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center bg-surface border border-line-strong rounded-md text-ink-faint text-xs">
                    -
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SecondaryButton onClick={handlePickLogo}>Izvēlēties attēlu</SecondaryButton>
              <PrimaryButton onClick={handleSaveLogo} disabled={!filePath || logoSaveState === 'saving'}>
                {logoSaveState === 'saving' ? 'Augšupielādē...' : 'Saglabāt logo'}
              </PrimaryButton>
              {logoSaveState === 'saved' && <SuccessText>Saglabāts!</SuccessText>}
            </div>
          </Panel>

          <ErrorText>{error}</ErrorText>
          {error?.includes('404') && (
            <p className="text-amber-400 text-xs">
              Ja kļūda ir 404 uz nosaukuma maiņu, visticamāk, šis endpoint vēl nav izvietots serverī (FTP izvietošana vēl nav veikta).
            </p>
          )}
        </>
      )}
    </div>
  )
})

export default TeamEditor

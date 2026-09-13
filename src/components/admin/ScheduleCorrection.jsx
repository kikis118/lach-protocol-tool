import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { updateSchedule, deleteGame } from '../../api'
import {
  Panel,
  Field,
  ScreenHeader,
  SelectInput,
  VenueSelect,
  PrimaryButton,
  SecondaryButton,
  ErrorText,
  SuccessText,
  kickoffToDatetimeLocal,
  fromDatetimeLocal,
} from './AdminUI'

const ScheduleCorrection = forwardRef(function ScheduleCorrection({ lookups, onCancel, initialGameId, askConfirm }, ref) {
  const teams = lookups?.teams || []
  const venues = lookups?.venues || []
  const teamName = (id) => teams.find((t) => String(t.id) === String(id))?.name || `#${id}`

  // update-game-schedule.php itself refuses (409) to touch a finished game -
  // filtering those out here just avoids picking one that will predictably fail.
  // deletedIds: games deleted THIS session - `lookups` is a snapshot fetched
  // once when the app opened and never refreshed, so a just-deleted game
  // would otherwise keep showing in the dropdown (and 404 if re-selected)
  // until the app reopens.
  const [deletedIds, setDeletedIds] = useState(() => new Set())
  const upcomingGames = useMemo(
    () =>
      (lookups?.games || [])
        .filter((g) => g.finished !== '1' && !deletedIds.has(String(g.game_id)))
        .slice()
        .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)),
    [lookups, deletedIds],
  )

  const initialGame = initialGameId ? upcomingGames.find((g) => String(g.game_id) === String(initialGameId)) : null
  const [gameId, setGameId] = useState(initialGame ? String(initialGame.game_id) : '')
  const selectedGame = upcomingGames.find((g) => String(g.game_id) === String(gameId)) || null

  const [kickoff, setKickoff] = useState(initialGame ? kickoffToDatetimeLocal(initialGame.kickoff) : '')
  const [venueId, setVenueId] = useState(initialGame?.venue_id ? String(initialGame.venue_id) : '')
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [deleteState, setDeleteState] = useState('idle')

  function pickGame(id) {
    setGameId(id)
    const g = upcomingGames.find((x) => String(x.game_id) === String(id))
    setKickoff(g ? kickoffToDatetimeLocal(g.kickoff) : '')
    setVenueId(g?.venue_id ? String(g.venue_id) : '')
    setSaveState('idle')
    setDeleteState('idle')
    setError(null)
  }

  async function handleSave() {
    setSaveState('saving')
    setError(null)
    try {
      await updateSchedule({
        gameId: selectedGame.game_id,
        kickoff: fromDatetimeLocal(kickoff),
        venueId: venueId || undefined,
      })
      setSaveState('saved')
    } catch (err) {
      setSaveState('failed')
      setError(err.message)
    }
  }

  async function handleDelete() {
    const ok = await askConfirm(
      `Vai tiešām dzēst spēli "${teamName(selectedGame.home_team)} vs ${teamName(selectedGame.away_team)}"? To nevar atsaukt.`,
      { danger: true },
    )
    if (!ok) return
    setDeleteState('deleting')
    setError(null)
    try {
      await deleteGame(selectedGame.game_id)
      setDeletedIds((prev) => new Set(prev).add(String(selectedGame.game_id)))
      setGameId('')
      setDeleteState('idle')
    } catch (err) {
      setDeleteState('failed')
      setError(err.message)
    }
  }

  const kickoffChanged = selectedGame && fromDatetimeLocal(kickoff) !== selectedGame.kickoff
  const venueChanged = selectedGame && String(venueId || '') !== String(selectedGame.venue_id || '')
  const canSave = selectedGame && kickoff && (kickoffChanged || venueChanged)

  // Picking a game to LOOK at isn't "data entry" - only an actual change
  // to its kickoff/venue is something leaving would lose (no autosave
  // here, a one-shot correction isn't worth the same draft machinery as
  // roster/bulk-import/mini-tournament). `saveState === 'saved'` overrides
  // this back to false - `lookups` is a snapshot fetched once when the app
  // opened and never refreshed, so selectedGame's own kickoff/venue still
  // look "changed" immediately after a successful save otherwise.
  useImperativeHandle(ref, () => ({ isDirty: () => saveState !== 'saved' && Boolean(kickoffChanged || venueChanged) }))

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Spēles laika/vietas labošana"
        subtitle="Tikai vēl nespēlētām, ieplānotām spēlēm - pabeigtu spēli šeit labot nevar."
        onCancel={onCancel}
      />

      <Panel>
        <Field label="Spēle">
          <SelectInput value={gameId} onChange={pickGame}>
            <option value="">Izvēlies...</option>
            {upcomingGames.map((g) => (
              <option key={g.game_id} value={g.game_id}>
                {teamName(g.home_team)} vs {teamName(g.away_team)} &middot; {g.kickoff}
              </option>
            ))}
          </SelectInput>
        </Field>
        {upcomingGames.length === 0 && (
          <p className="text-ink-faint text-sm">Nav atrasta neviena ieplānota, vēl nespēlēta spēle.</p>
        )}
      </Panel>

      {selectedGame && (
        <Panel>
          <p className="text-ink font-semibold text-sm">
            {teamName(selectedGame.home_team)} vs {teamName(selectedGame.away_team)}
          </p>
          <Field label="Jauns datums un laiks">
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(e) => setKickoff(e.target.value)}
              className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent"
            />
          </Field>
          <Field label="Vieta">
            <VenueSelect venues={venues} value={venueId} onChange={setVenueId} />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={handleSave} disabled={!canSave || saveState === 'saving'}>
              {saveState === 'saving' ? 'Saglabā...' : 'Saglabāt izmaiņas'}
            </PrimaryButton>
            {saveState === 'saved' && <SuccessText>Saglabāts!</SuccessText>}
            <ErrorText>{error}</ErrorText>
          </div>

          <div className="pt-2 border-t border-line-strong">
            <SecondaryButton
              onClick={handleDelete}
              disabled={deleteState === 'deleting'}
              className="!border-red-500/40 !text-red-400 hover:!border-red-500 hover:!text-red-300"
            >
              {deleteState === 'deleting' ? 'Dzēš...' : 'Dzēst spēli'}
            </SecondaryButton>
          </div>
        </Panel>
      )}
    </div>
  )
})

export default ScheduleCorrection

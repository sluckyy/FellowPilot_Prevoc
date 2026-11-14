import { requirePageUser } from '@/lib/auth';
import { myTeam } from '@/lib/teams';
import { currentSeason, teamSeasonProgress } from '@/lib/seasons';
import { CHALLENGE_LABELS, MIN_TEAM_SIZE } from '@/lib/core';
import { TeamClient } from './TeamClient';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const u = await requirePageUser();
  const [team, season] = await Promise.all([myTeam(u.id), currentSeason(u.tenantId)]);
  const teamSeason = team && season ? await teamSeasonProgress(season, team.id) : null;
  return (
    <div className="page">
      <div className="stack">
        <h1>Team</h1>
        <p className="muted">Teams are your site or cohort. Season challenges add up across the team, and only the team total is ever shown, once there are at least {MIN_TEAM_SIZE} members. There is no individual leaderboard.</p>
      </div>
      {team && season ? (
        <section className="panel stack" aria-labelledby="ts">
          <h2 id="ts">{season.title}: team challenge</h2>
          <p>{CHALLENGE_LABELS[season.challenge.type](season.challenge)}{season.team_goal ? `, ${season.team_goal} together as a team` : ', added up across the team'}.</p>
          {teamSeason ? (
            <>
              <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={teamSeason.target} aria-valuenow={teamSeason.current} aria-label="Team progress"><span style={{ width: `${Math.round((100 * teamSeason.current) / teamSeason.target)}%` }} /></div>
              <p className="small muted num">{teamSeason.current} of {teamSeason.target} across {teamSeason.members} members{teamSeason.done ? '. Done!' : '.'}</p>
            </>
          ) : <p className="small muted">The team total shows once {MIN_TEAM_SIZE} people have joined ({team.size} so far).</p>}
        </section>
      ) : null}
      <TeamClient team={team} />
    </div>
  );
}

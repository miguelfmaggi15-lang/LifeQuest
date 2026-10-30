/* Replay authoritative rolls received by polling, once per feed entry. */
window.MultiplayerRolls = {
  async replay(previous, next, meId, type, animate) {
    // Joining/reconnecting shows the current board without replaying old turns.
    if (!previous || previous.game?.id !== next.game?.id) return;
    const watermark = Math.max(0, ...(previous.feed || []).map(f => Number(f.id)));
    const positions = new Map(previous.players.map(p => [Number(p.player_id), Number(p.position)]));
    const entries = (next.feed || []).filter(f => Number(f.id) > watermark && f.action_type === type);
    for (const entry of entries) {
      const pid = Number(entry.player_id), player = next.players.find(p => Number(p.player_id) === pid);
      if (!player) continue;
      const data = entry.animation || {};
      const from = Number(data.from ?? positions.get(pid) ?? player.position);
      const to = Number(data.to ?? entry.position ?? player.position);
      positions.set(pid, to);
      if (pid === Number(meId)) continue;
      // Legacy PHP feeds carry the individual dice in the roll description.
      const match = String(entry.description).match(/(\d)\+(\d)=/);
      const dice = data.dice || (match ? [Number(match[1]), Number(match[2])] : null);
      await animate({ pid, from, to, dice, value: Number(data.spin ?? entry.value), name: player.name }, next);
    }
  }
};

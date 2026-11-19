package ru.twomc.giveaway;

import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;

/**
 * Расширение PlaceholderAPI: %twomcgiveaway_hours% и др. (см. PlaceholderFormat). Загружается только если
 * PlaceholderAPI установлен (softdepend); без него этот класс не трогается. Читает только кэш, без сети.
 */
public final class GiveawayExpansion extends PlaceholderExpansion {
    private final ProgressService progress;
    private final String cutoffText;
    private final String version;

    public GiveawayExpansion(ProgressService progress, String cutoffText, String version) {
        this.progress = progress;
        this.cutoffText = cutoffText;
        this.version = version;
    }

    @Override public String getIdentifier() { return "twomcgiveaway"; }
    @Override public String getAuthor() { return "TwoMC"; }
    @Override public String getVersion() { return version; }
    @Override public boolean persist() { return true; }

    @Override
    public String onRequest(OfflinePlayer player, String params) {
        PlayerProgress p = player == null ? null : progress.get(player.getUniqueId());
        return PlaceholderFormat.resolve(params, p, progress.thresholdMinutes(), cutoffText);
    }
}

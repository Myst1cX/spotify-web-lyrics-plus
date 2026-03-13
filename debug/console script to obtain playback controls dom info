// Run this in browser console on open.spotify.com
(function() {
const selectors = [
'[data-testid="control-button-shuffle"]',
'[data-testid="control-button-skip-back"]', …
{
"[data-testid="control-button-shuffle"]": "NOT FOUND",
"[data-testid="control-button-skip-back"]": {
"outerHTML": "<button data-testid="control-button-skip-back" class="Button-sc-1dqy6lx-0 fprjoI e-91000-overflow-wrap-anywhere e-91000-button-tertiary--icon-only" aria-label="Previous" data-encore-id="buttonTertiary"><span aria-hidden="true" class="e-91000-button__icon-wrapper"><svg data-encore-id="icon" role="img" aria-hidden="true" class="e-91000-icon e-91000-baseline" style="--encore-icon-height: var(--encore-graphic-size-decorative-smaller); --encore-icon-width: var(--encore-graphic-size-decorative-smaller);" viewBox="0 0 16 16"><path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7z"></path></svg></span></button>",
"ariaLabel": "Previous",
"ariaChecked": null
},
"[data-testid="control-button-playpause"]": {
"outerHTML": "<button data-testid="control-button-playpause" aria-label="Pause" data-encore-id="buttonPrimary" data-is-icon-only="true" class="e-91000-button-primary e-91000-button"><span class="e-91000-baseline e-91000-overflow-wrap-anywhere e-91000-button-primary__inner encore-inverted-light-set e-91000-button-icon-only--small"><span aria-hidden="true" class="e-91000-button__icon-wrapper"><svg data-encore-id="icon" role="img" aria-hidden="true" class="e-91000-icon e-91000-baseline" style="--encore-icon-height: var(--encore-graphic-size-decorative-smaller); --encore-icon-width: var(--encore-graphic-size-decorative-smaller);" viewBox="0 0 16 16"><path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z"></path></svg></span></span></button>",
"ariaLabel": "Pause",
"ariaChecked": null
},
"[data-testid="control-button-skip-forward"]": {
"outerHTML": "<button data-testid="control-button-skip-forward" class="Button-sc-1dqy6lx-0 fprjoI e-91000-overflow-wrap-anywhere e-91000-button-tertiary--icon-only" aria-label="Next" data-encore-id="buttonTertiary"><span aria-hidden="true" class="e-91000-button__icon-wrapper"><svg data-encore-id="icon" role="img" aria-hidden="true" class="e-91000-icon e-91000-baseline" style="--encore-icon-height: var(--encore-graphic-size-decorative-smaller); --encore-icon-width: var(--encore-graphic-size-decorative-smaller);" viewBox="0 0 16 16"><path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z"></path></svg></span></button>",
"ariaLabel": "Next",
"ariaChecked": null
},
"[data-testid="control-button-repeat"]": {
"outerHTML": "<button data-testid="control-button-repeat" role="checkbox" aria-checked="false" class="Button-sc-1dqy6lx-0 fprjoI e-91000-overflow-wrap-anywhere e-91000-button-tertiary--icon-only" aria-label="Disable repeat" data-encore-id="buttonTertiary" disabled=""><span aria-hidden="true" class="e-91000-button__icon-wrapper"><svg data-encore-id="icon" role="img" aria-hidden="true" class="e-91000-icon e-91000-baseline" style="--encore-icon-height: var(--encore-graphic-size-decorative-smaller); --encore-icon-width: var(--encore-graphic-size-decorative-smaller);" viewBox="0 0 16 16"><path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75z"></path></svg></span></button>",
"ariaLabel": "Disable repeat",
"ariaChecked": "false"
}
for shuffle u can see how i have it in my script it was specific selectors...

document.querySelectorAll('[data-testid*="control-button"]').forEach(el => console.log(el.dataset.testid, el.outerHTML.substring(0, 150)));
control-button-skip-back <button data-testid="control-button-skip-back" class="Button-sc-1dqy6lx-0 fprjoI e-91000-overflow-wrap-anywhere e-91000-button-tertiary--icon-only" ar web-player.5091e124.js:1:2892828
control-button-playpause <button data-testid="control-button-playpause" aria-label="Pause" data-encore-id="buttonPrimary" data-is-icon-only="true" class="e-91000-button-primar web-player.5091e124.js:1:2892828
control-button-skip-forward <button data-testid="control-button-skip-forward" class="Button-sc-1dqy6lx-0 fprjoI e-91000-overflow-wrap-anywhere e-91000-button-tertiary--icon-only" web-player.5091e124.js:1:2892828
control-button-repeat <button data-testid="control-button-repeat" role="checkbox" aria-checked="mixed" class="Button-sc-1dqy6lx-0 bLLOzN e-91000-overflow-wrap-anywhere e-91 web-player.5091e124.js:1:2892828
control-button-npv <button data-testid="control-button-npv" data-active="true" aria-pressed="true" data-restore-focus-key="now_playing_view" class="Button-sc-1dqy6lx-0 f web-player.5091e124.js:1:2892828
control-button-queue <button data-testid="control-button-queue" data-active="false" aria-pressed="false" data-restore-focus-key="queue" class="Button-sc-1dqy6lx-0 fprjoI e web-player.5091e124.js:1:2892828
undefined

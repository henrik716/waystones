/**
 * Waystones Logo SVG content (without the wrapping <span> or <a>)
 * Standard 200x200 viewBox.
 */
export const WAYSTONES_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="stoneFace" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#eef0ff"/>
      <stop offset="28%"  stop-color="#f3f4ff"/>
      <stop offset="52%"  stop-color="#f5f6ff"/>
      <stop offset="78%"  stop-color="#f3f4ff"/>
      <stop offset="100%" stop-color="#eef0ff"/>
    </linearGradient>

    <radialGradient id="cosmicCore" cx="46%" cy="44%" r="58%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="8%"   stop-color="#c7d2fe" stop-opacity="0.95"/>
      <stop offset="22%"  stop-color="#4338ca" stop-opacity="0.75"/>
      <stop offset="42%"  stop-color="#4338ca" stop-opacity="0.5"/>
      <stop offset="65%"  stop-color="#eef0ff" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#f5f5ff" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="nebula1" cx="60%" cy="38%" r="50%">
      <stop offset="0%"   stop-color="#4338ca" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#4338ca" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="nebula2" cx="35%" cy="65%" r="45%">
      <stop offset="0%"   stop-color="#4338ca" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#4338ca" stop-opacity="0"/>
    </radialGradient>

    <filter id="bigBloom" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="8" result="b1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b2"/>
      <feMerge><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="rockGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <clipPath id="hexClip">
      <polygon points="100,14 171,55 171,137 100,178 29,137 29,55"/>
    </clipPath>
    <clipPath id="portalClip">
      <ellipse cx="100" cy="96" rx="48" ry="58"/>
    </clipPath>
  </defs>

  <polygon points="100,11 174,53 174,139 100,181 26,139 26,53" fill="#dde0ff"/>
  <polygon points="100,14 171,55 171,137 100,178 29,137 29,55" fill="url(#stoneFace)"/>

  <g clip-path="url(#hexClip)" fill="none" stroke-linecap="round">
    <path d="M 46,68 Q 40,82 45,98"       stroke="#4338ca" stroke-width="1.1" opacity="0.35"/>
    <path d="M 154,68 Q 160,82 155,98"    stroke="#4338ca" stroke-width="1.1" opacity="0.35"/>
    <path d="M 40,108 Q 36,124 42,138"    stroke="#4338ca" stroke-width="0.9" opacity="0.25"/>
    <path d="M 160,108 Q 164,124 158,138" stroke="#4338ca" stroke-width="0.9" opacity="0.25"/>
    <path d="M 80,28 Q 76,38 80,48"       stroke="#4338ca" stroke-width="0.8" opacity="0.3"/>
    <path d="M 120,28 Q 124,38 120,48"    stroke="#4338ca" stroke-width="0.8" opacity="0.3"/>
    <path d="M 80,152 Q 76,162 80,172"    stroke="#4338ca" stroke-width="0.8" opacity="0.25"/>
    <path d="M 120,152 Q 124,162 120,172" stroke="#4338ca" stroke-width="0.8" opacity="0.25"/>
  </g>

  <polygon points="100,14 171,55 171,137 100,178 29,137 29,55"
            fill="none" stroke="#4338ca" stroke-width="1.5" opacity="0.45" filter="url(#glow)"/>

  <polygon points="84,18 90,6 97,0 103,0 110,6 116,18 108,26 100,24 92,26" fill="#dde0ff" stroke="#c7d2fe" stroke-width="0.5"/>
  <polygon points="86,18 91,8 97,2 103,2 109,8 114,18 107,25 100,23 93,25" fill="#eef0ff"/>
  <path d="M 94,14 L 100,10 L 106,14" fill="none" stroke="#c7d2fe" stroke-width="0.7" opacity="0.7"/>
  <path d="M 84,18 L 92,26 L 100,24 L 108,26 L 116,18" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" opacity="0.9" filter="url(#rockGlow)"/>
  <path d="M 84,18 L 92,26 L 100,24 L 108,26 L 116,18" fill="none" stroke="#4338ca" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
  <polygon points="96,-4 99,-6 102,-4 99,-2" fill="#eef0ff" opacity="0.85"/>
  <path d="M 97,-4 L 101,-5" stroke="#4338ca" stroke-width="0.7" opacity="0.7"/>
  <circle cx="88" cy="8"  r="1.1" fill="#dde0ff" opacity="0.9"/>
  <circle cx="112" cy="8" r="1"   fill="#dde0ff" opacity="0.85"/>

  <polygon points="165,42 172,33 180,30 187,36 192,46 188,58 178,64 170,60 166,50" fill="#dde0ff" stroke="#c7d2fe" stroke-width="0.5"/>
  <polygon points="166,43 173,35 180,32 186,38 190,47 186,57 177,63 170,59 167,50" fill="#eef0ff"/>
  <path d="M 174,40 L 180,38 L 184,44" fill="none" stroke="#c7d2fe" stroke-width="0.7" opacity="0.7"/>
  <path d="M 165,42 L 166,50 L 170,60 L 178,64" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" opacity="0.9" filter="url(#rockGlow)"/>
  <path d="M 165,42 L 166,50 L 170,60 L 178,64" fill="none" stroke="#4338ca" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
  <polygon points="192,38 195,34 198,38 195,41" fill="#eef0ff" opacity="0.85"/>
  <path d="M 193,39 L 196,35" stroke="#4338ca" stroke-width="0.7" opacity="0.7"/>
  <circle cx="184" cy="32" r="1.1" fill="#dde0ff" opacity="0.9"/>

  <polygon points="165,150 170,132 178,128 188,134 192,146 188,158 180,164 172,160 166,152" fill="#dde0ff" stroke="#c7d2fe" stroke-width="0.5"/>
  <polygon points="166,149 171,133 178,130 187,136 190,146 186,157 179,163 172,159 167,151" fill="#eef0ff"/>
  <path d="M 174,152 L 180,154 L 184,148" fill="none" stroke="#c7d2fe" stroke-width="0.7" opacity="0.7"/>
  <path d="M 165,150 L 166,152 L 170,132 L 178,128" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" opacity="0.9" filter="url(#rockGlow)"/>
  <path d="M 165,150 L 166,152 L 170,132 L 178,128" fill="none" stroke="#4338ca" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
  <polygon points="192,154 196,158 193,162 190,158" fill="#eef0ff" opacity="0.85"/>
  <circle cx="184" cy="162" r="1.1" fill="#dde0ff" opacity="0.9"/>

  <polygon points="84,174 92,166 100,168 108,166 116,174 110,186 103,192 97,192 90,186" fill="#dde0ff" stroke="#c7d2fe" stroke-width="0.5"/>
  <polygon points="85,174 93,167 100,169 107,167 115,174 109,185 103,190 97,190 91,185" fill="#eef0ff"/>
  <path d="M 94,178 L 100,182 L 106,178" fill="none" stroke="#c7d2fe" stroke-width="0.7" opacity="0.7"/>
  <path d="M 84,174 L 92,166 L 100,168 L 108,166 L 116,174" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" opacity="0.9" filter="url(#rockGlow)"/>
  <path d="M 84,174 L 92,166 L 100,168 L 108,166 L 116,174" fill="none" stroke="#4338ca" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
  <polygon points="97,194 100,198 103,194 100,191" fill="#eef0ff" opacity="0.85"/>
  <circle cx="88" cy="186" r="1.1" fill="#dde0ff" opacity="0.85"/>
  <circle cx="112" cy="186" r="1"   fill="#dde0ff" opacity="0.8"/>

  <polygon points="22,128 30,128 34,132 35,150 30,160 20,164 12,158 8,146 12,136" fill="#dde0ff" stroke="#c7d2fe" stroke-width="0.5"/>
  <polygon points="23,129 30,129 33,133 34,150 29,159 20,162 13,157 9,146 13,137" fill="#eef0ff"/>
  <path d="M 16,140 L 22,138 L 26,144" fill="none" stroke="#c7d2fe" stroke-width="0.7" opacity="0.7"/>
  <path d="M 22,128 L 30,128 L 34,132 L 35,150" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" opacity="0.9" filter="url(#rockGlow)"/>
  <path d="M 22,128 L 30,128 L 34,132 L 35,150" fill="none" stroke="#4338ca" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
  <polygon points="8,152 4,156 6,161 10,157" fill="#eef0ff" opacity="0.85"/>
  <circle cx="16" cy="162" r="1.1" fill="#dde0ff" opacity="0.9"/>

  <polygon points="22,64 12,58 8,46 13,36 21,30 30,32 35,42 34,54 28,62" fill="#dde0ff" stroke="#c7d2fe" stroke-width="0.5"/>
  <polygon points="23,63 13,57 9,47 14,38 21,32 30,34 34,43 33,53 27,61" fill="#eef0ff"/>
  <path d="M 16,52 L 22,54 L 26,48" fill="none" stroke="#c7d2fe" stroke-width="0.7" opacity="0.7"/>
  <path d="M 22,64 L 34,54 L 35,42 L 30,32" fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" opacity="0.9" filter="url(#rockGlow)"/>
  <path d="M 22,64 L 34,54 L 35,42 L 30,32" fill="none" stroke="#4338ca" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
  <polygon points="8,40 4,36 6,32 10,36" fill="#eef0ff" opacity="0.85"/>
  <circle cx="16" cy="34" r="1.1" fill="#dde0ff" opacity="0.9"/>

  <ellipse cx="100" cy="96" rx="50" ry="60" fill="#f5f6ff"/>

  <g clip-path="url(#portalClip)" fill="#4338ca">
    <circle cx="72"  cy="54"  r="0.8" opacity="0.7"/>
    <circle cx="88"  cy="46"  r="0.6" opacity="0.55"/>
    <circle cx="118" cy="50"  r="0.9" opacity="0.65"/>
    <circle cx="134" cy="60"  r="0.6" opacity="0.5"/>
    <circle cx="64"  cy="74"  r="0.7" opacity="0.55"/>
    <circle cx="138" cy="82"  r="0.7" opacity="0.55"/>
    <circle cx="58"  cy="112" r="0.8" opacity="0.6"/>
    <circle cx="142" cy="108" r="0.6" opacity="0.5"/>
    <circle cx="74"  cy="142" r="0.7" opacity="0.5"/>
    <circle cx="128" cy="140" r="0.8" opacity="0.55"/>
    <circle cx="112" cy="62"  r="0.5" opacity="0.45"/>
    <circle cx="82"  cy="132" r="0.6" opacity="0.5"/>
    <circle cx="104" cy="148" r="0.7" opacity="0.5"/>
    <circle cx="78"  cy="90"  r="0.5" opacity="0.4"/>
    <circle cx="130" cy="122" r="0.5" opacity="0.4"/>
  </g>

  <ellipse cx="100" cy="96" rx="49" ry="59" fill="url(#nebula1)" clip-path="url(#portalClip)"/>
  <ellipse cx="100" cy="96" rx="49" ry="59" fill="url(#nebula2)" clip-path="url(#portalClip)"/>
  <ellipse cx="100" cy="96" rx="49" ry="59" fill="url(#cosmicCore)"/>

  <ellipse cx="100" cy="96" rx="49" ry="59" fill="none" stroke="#4338ca" stroke-width="18" opacity="0.12" filter="url(#bigBloom)"/>
  <ellipse cx="100" cy="96" rx="49" ry="59" fill="none" stroke="#4338ca" stroke-width="2.5" opacity="0.8" filter="url(#glow)"/>
  <ellipse cx="100" cy="96" rx="37" ry="45" fill="none" stroke="#4338ca" stroke-width="1.2" opacity="0.5" filter="url(#glow)"/>
  <ellipse cx="100" cy="96" rx="25" ry="31" fill="none" stroke="#4338ca" stroke-width="0.8" opacity="0.2"/>

  <path d="M 100,96 C 106,88 116,87 121,95 C 127,104 122,118 110,122 C 97,127 82,120 77,106 C 71,91 78,73 94,69 C 113,65 130,78 132,99 C 135,123 119,140 100,141 C 77,143 59,124 58,101"
        fill="none" stroke="#e8eaff" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <path d="M 100,96 C 106,88 116,87 121,95 C 127,104 122,118 110,122 C 97,127 82,120 77,106 C 71,91 78,73 94,69 C 113,65 130,78 132,99 C 135,123 119,140 100,141 C 77,143 59,124 58,101"
        fill="none" stroke="#4338ca" stroke-width="6" stroke-linecap="round" opacity="0.25" filter="url(#bigBloom)"/>
  <path d="M 100,96 C 106,88 116,87 121,95 C 127,104 122,118 110,122 C 97,127 82,120 77,106 C 71,91 78,73 94,69 C 113,65 130,78 132,99 C 135,123 119,140 100,141 C 77,143 59,124 58,101"
        fill="none" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" filter="url(#glow)"/>

  <g filter="url(#softGlow)">
    <circle cx="100" cy="36"  r="1.8" fill="#4338ca" opacity="0.6"/>
    <circle cx="155" cy="44"  r="1.6" fill="#4338ca" opacity="0.55"/>
    <circle cx="162" cy="58"  r="1.3" fill="#4338ca" opacity="0.5"/>
    <circle cx="158" cy="132" r="1.6" fill="#4338ca" opacity="0.55"/>
    <circle cx="162" cy="146" r="1.3" fill="#4338ca" opacity="0.5"/>
    <circle cx="100" cy="158" r="1.8" fill="#4338ca" opacity="0.55"/>
    <circle cx="42"  cy="132" r="1.6" fill="#4338ca" opacity="0.55"/>
    <circle cx="38"  cy="146" r="1.3" fill="#4338ca" opacity="0.5"/>
    <circle cx="42"  cy="58"  r="1.6" fill="#4338ca" opacity="0.55"/>
    <circle cx="38"  cy="46"  r="1.3" fill="#4338ca" opacity="0.5"/>
  </g>

  <ellipse cx="100" cy="96" rx="56" ry="66" fill="#4338ca" opacity="0.08"/>
  <ellipse cx="100" cy="96" rx="49" ry="59" fill="none" stroke="#4338ca" stroke-width="2.5" opacity="0.8" filter="url(#glow)"/>

  <circle cx="100" cy="22"  r="3.5" fill="#4338ca" filter="url(#glow)" opacity="0.85"/>
  <circle cx="176" cy="46"  r="3.5" fill="#4338ca" filter="url(#glow)" opacity="0.85"/>
  <circle cx="176" cy="146" r="3.5" fill="#4338ca" filter="url(#glow)" opacity="0.85"/>
  <circle cx="100" cy="170" r="3.5" fill="#4338ca" filter="url(#glow)" opacity="0.85"/>
  <circle cx="24"  cy="146" r="3.5" fill="#4338ca" filter="url(#glow)" opacity="0.85"/>
  <circle cx="24"  cy="46"  r="3.5" fill="#4338ca" filter="url(#glow)" opacity="0.85"/>
</svg>
`;

/**
 * Waystones Favicon as a Data URL (SVG)
 */
export const WAYSTONES_FAVICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(WAYSTONES_LOGO_SVG)}`;

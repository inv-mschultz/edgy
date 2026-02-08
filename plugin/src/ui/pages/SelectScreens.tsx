import React from "react";

interface Props {
  screens: { id: string; name: string }[];
}

function EdgyLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="140" height="64" fill="none" viewBox="0 0 140 64">
      <path fill="#370455" d="M116.444 63.11V35.467l-9.555-33.244V.889h14.096l1.892 23.11h1.23L125.999.89H140v1.333l-9.46 33.244v27.645h-14.096ZM81.721 64c-3.027 0-5.613-.681-7.757-2.044-2.081-1.423-3.658-3.29-4.73-5.6-1.072-2.37-1.608-5.008-1.608-7.912V15.556c0-2.134.567-4.149 1.702-6.045s2.618-3.555 4.447-4.978a22.185 22.185 0 0 1 6.243-3.289C82.288.414 84.56 0 86.83 0c3.09 0 6.086.711 8.987 2.133 2.901 1.363 5.298 3.23 7.19 5.6 1.955 2.311 2.932 4.919 2.932 7.823v6.31h-14V16.89c0-1.363-.568-2.43-1.704-3.2-1.072-.83-2.207-1.245-3.405-1.245-1.199 0-2.365.415-3.5 1.245-1.073.77-1.609 1.837-1.609 3.2v29.778c0 1.303.6 2.459 1.798 3.466 1.198 1.008 2.49 1.511 3.878 1.511 1.45 0 2.775-.503 3.974-1.51 1.198-1.008 1.797-2.164 1.797-3.467v-5.69h-6.433V28.534h19.204v34.578H93.168V60h-1.419c-.315.77-1.072 1.452-2.27 2.044-1.136.593-2.429 1.067-3.88 1.423-1.387.355-2.68.533-3.878.533Zm-51.419-.89V.89h16.556c3.09 0 5.865.71 8.325 2.133 2.522 1.363 4.509 3.23 5.96 5.6 1.513 2.311 2.27 4.918 2.27 7.822v31.111c0 2.904-.757 5.541-2.27 7.912-1.451 2.31-3.438 4.177-5.96 5.6-2.46 1.362-5.235 2.044-8.325 2.044H30.302Zm14.096-11.466h2.649c.63 0 1.135-.207 1.513-.622.442-.415.663-.889.663-1.422V14.489c0-.534-.221-1.008-.663-1.423-.378-.414-.883-.622-1.513-.622h-2.649v39.2ZM0 63.11V.89h26.489v11.555H14.096v12.89h8.23v13.332h-8.23v12.978h12.393v11.467H0Z"/>
    </svg>
  );
}

export function SelectScreens({ screens }: Props) {
  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Hero section with logo and tagline */}
      <div className="pt-2">
        <EdgyLogo />
        <p
          className="text-sm font-medium mt-3 uppercase tracking-wide"
          style={{ color: '#4A1A6B' }}
        >
          Select your happy path.
        </p>
        <p
          className="text-sm font-medium uppercase tracking-wide"
          style={{ color: '#4A1A6B' }}
        >
          We'll find the edge cases you missed.
        </p>
      </div>

      {/* Selected screens section */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold" style={{ color: '#4A1A6B' }}>
            {screens.length === 0 ? "Select frames to get started." : "Selected frames"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {screens.length === 0
              ? "Select frames on the Figma canvas that you'd like to analyse for missing edge cases."
              : "These frames will be analysed for missing edge cases."}
          </p>
          {screens.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              We will search for missing states, edge inputs, permissions, connectivity, destructive actions and more!
            </p>
          )}
        </div>

        {/* Frame count or empty state */}
        <div
          className="text-sm font-semibold"
          style={{ color: '#4A1A6B' }}
        >
          {screens.length} frame{screens.length !== 1 ? "s" : ""} selected
          {screens.length > 0 && ` (${screens.length})`}
        </div>

        {/* Selected frames list */}
        {screens.length > 0 && (
          <div className="flex flex-col gap-2">
            {screens.map((screen) => (
              <div
                key={screen.id}
                className="flex items-center px-4 py-3 rounded-lg"
                style={{ backgroundColor: '#FFF8E7' }}
              >
                <span className="text-sm" style={{ color: '#4A1A6B' }}>
                  {screen.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

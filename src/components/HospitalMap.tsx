import React, { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin } from 'lucide-react';

interface ResolvedHospitalPlace {
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  googleMapsURI?: string;
}

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

function HospitalMapCanvas({
  hospitalName,
  fallbackAddress,
}: {
  hospitalName: string;
  fallbackAddress: string;
}) {
  const placesLib = useMapsLibrary('places');
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [place, setPlace] = useState<ResolvedHospitalPlace | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookupHospital = useCallback(async () => {
    if (!placesLib) return;
    try {
      const { places } = await placesLib.Place.searchByText({
        textQuery: 'CHC Muribahal Hospital, Muribahal, Odisha, India',
        fields: ['displayName', 'formattedAddress', 'location', 'googleMapsURI'],
        language: 'en',
        region: 'IN',
        maxResultCount: 1,
      });

      const found = places?.[0];
      if (found?.location) {
        setPlace({
          name: found.displayName || hospitalName,
          formattedAddress: found.formattedAddress || fallbackAddress,
          location: {
            lat: found.location.lat(),
            lng: found.location.lng(),
          },
          googleMapsURI: found.googleMapsURI || undefined,
        });
        setLookupError(null);
        return;
      }

      // Secondary lookup for Muribahal town if the specific CHC listing is unindexed
      const fallbackRes = await placesLib.Place.searchByText({
        textQuery: 'Muribahal, Balangir, Odisha, India',
        fields: ['displayName', 'formattedAddress', 'location', 'googleMapsURI'],
        language: 'en',
        region: 'IN',
        maxResultCount: 1,
      });

      const area = fallbackRes.places?.[0];
      if (area?.location) {
        setPlace({
          name: hospitalName,
          formattedAddress: area.formattedAddress || fallbackAddress,
          location: {
            lat: area.location.lat(),
            lng: area.location.lng(),
          },
          googleMapsURI: area.googleMapsURI || undefined,
        });
        setLookupError(null);
      } else {
        setLookupError('Location pin could not be resolved right now. Use the directions link below.');
      }
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT') ||
        msg.includes('429')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setLookupError('Unable to load place coordinates from Google Maps Places API.');
    }
  }, [placesLib, hospitalName, fallbackAddress]);

  useEffect(() => {
    void lookupHospital();
  }, [lookupHospital]);

  if (!place) {
    return (
      <div className="h-[380px] w-full bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 text-center">
        <MapPin className="w-7 h-7 text-blue-800 mb-3" />
        <p className="text-sm font-medium text-slate-800">
          {lookupError ? lookupError : 'Locating CHC Muribahal Hospital on Google Maps...'}
        </p>
        <p className="text-xs text-slate-500 mt-1">{fallbackAddress}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[380px] w-full rounded-xl overflow-hidden border border-slate-200">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={place.location}
          center={place.location}
          defaultZoom={15}
          gestureHandling="cooperative"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <AdvancedMarker
            ref={markerRef}
            position={place.location}
            title={place.name}
            onClick={() => setInfoOpen(true)}
          >
            <Pin background="#1e40af" borderColor="#1e3a8a" glyphColor="#ffffff" />
          </AdvancedMarker>

          {infoOpen && marker && (
            <InfoWindow anchor={marker} onCloseClick={() => setInfoOpen(false)} maxWidth={260}>
              <div className="p-1 text-slate-900">
                <p className="font-display font-semibold text-sm">{place.name}</p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{place.formattedAddress}</p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>Map location resolved live via Google Maps Platform (for general visitor directions only).</span>
        {place.googleMapsURI && (
          <a
            href={place.googleMapsURI}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-blue-800 hover:underline"
          >
            Open in Google Maps
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export function HospitalMap({
  hospitalName,
  fallbackAddress,
}: {
  hospitalName: string;
  fallbackAddress: string;
}) {
  if (!MAPS_API_KEY) {
    return (
      <div className="h-[380px] w-full bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center justify-center p-6 text-center">
        <MapPin className="w-7 h-7 text-blue-800 mb-3" />
        <p className="text-sm font-semibold text-slate-900">{hospitalName}</p>
        <p className="text-xs text-slate-600 mt-1 max-w-md">{fallbackAddress}</p>
        <p className="text-xs text-slate-500 mt-3">
          Configure <span className="font-mono-tabular">VITE_GOOGLE_MAPS_API_KEY</span> to render the interactive Google Map.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={MAPS_API_KEY} language="en" region="IN" libraries={['places', 'marker']}>
      <HospitalMapCanvas hospitalName={hospitalName} fallbackAddress={fallbackAddress} />
    </APIProvider>
  );
}

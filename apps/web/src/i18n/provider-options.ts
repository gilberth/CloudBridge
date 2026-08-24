import type { ProviderOption } from '@cloudbridge/shared';

export type SupportedLocale = 'es';

export const DEFAULT_LOCALE: SupportedLocale = 'es';

type OptionTranslation = {
  help: string;
  examples?: Record<string, string>;
};

type ProviderOptionCatalog = Record<string, OptionTranslation>;

const es: ProviderOptionCatalog = {
  '*.client_id': {
    help: 'Identificador de cliente OAuth. Normalmente puedes dejarlo vacío para usar el cliente integrado de rclone.',
  },
  '*.client_secret': {
    help: 'Secreto del cliente OAuth. Déjalo vacío salvo que utilices tus propias credenciales de aplicación.',
  },
  '*.region': {
    help: 'Región del servicio en la que se encuentra alojada la cuenta o los datos.',
  },
  '*.tenant': {
    help: 'Identificador del tenant o directorio al que pertenece la cuenta.',
  },
  '*.drive_id': {
    help: 'Identificador de la unidad que rclone debe utilizar dentro de la cuenta.',
  },
  '*.access_key_id': {
    help: 'Identificador de la clave de acceso proporcionada por el servicio de almacenamiento.',
  },
  '*.secret_access_key': {
    help: 'Clave secreta asociada al identificador de acceso. Se guarda como un dato protegido.',
  },
  '*.endpoint': {
    help: 'Dirección del endpoint compatible con este proveedor. Déjala vacía para usar el endpoint predeterminado.',
  },
  '*.host': {
    help: 'Nombre de host o dirección IP del servidor remoto.',
  },
  '*.port': {
    help: 'Puerto de red utilizado para conectarse al servidor remoto.',
  },
  '*.user': {
    help: 'Nombre de usuario utilizado para autenticar la conexión.',
  },
  '*.pass': {
    help: 'Contraseña utilizada para autenticar la conexión. Se guarda de forma protegida.',
  },
  '*.root_folder_id': {
    help: 'Identificador de la carpeta que se utilizará como raíz del remoto.',
  },
  '*.scope': {
    help: 'Nivel de acceso que rclone solicitará al proveedor.',
  },
  '*.service_account_file': {
    help: 'Ruta al archivo JSON con las credenciales de la cuenta de servicio.',
  },
  '*.service_account_credentials': {
    help: 'Contenido JSON de las credenciales de la cuenta de servicio.',
  },
  '*.chunk_size': {
    help: 'Tamaño de cada bloque utilizado durante las transferencias. Un valor mayor consume más memoria.',
  },
  '*.encoding': {
    help: 'Reglas utilizadas para representar caracteres especiales en nombres de archivos y carpetas.',
  },
  'onedrive.region': {
    help: 'Nube de Microsoft donde se encuentra la cuenta de OneDrive.',
    examples: {
      global: 'Nube global de Microsoft',
      us: 'Nube de Microsoft para el Gobierno de Estados Unidos',
      de: 'Nube de Microsoft en Alemania',
      cn: 'Microsoft Azure operado por 21Vianet en China',
    },
  },
};

const catalogs: Record<SupportedLocale, ProviderOptionCatalog> = { es };

export function localizeProviderOption(
  provider: string,
  option: ProviderOption,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  const catalog = catalogs[locale];
  const translation =
    catalog[`${provider}.${option.name}`] ?? catalog[`*.${option.name}`];

  return {
    help:
      translation?.help ??
      `Configura la opción técnica ${option.name} para este proveedor.`,
    exampleHelp: (value: string) => translation?.examples?.[value],
  };
}

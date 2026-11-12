// PixoBooks reference data — hardcoded dropdown source for onboarding + settings.
// Copy to your app at src/lib/referenceData.ts (no dependencies, tree-shakeable).
// Countries: name + ISO2/ISO3 + ISD dial code + default currency.
// Currencies: ISO 4217 + common symbols + minor-unit decimals.
// Timezones: canonical IANA list.

export type Country = { name: string; iso2: string; iso3: string; dial: string; currency: string };
export type Currency = { code: string; name: string; symbol: string; decimals: number };

export const COUNTRIES: Country[] = [
  { name: "Afghanistan", iso2: "AF", iso3: "AFG", dial: "93", currency: "AFN" },
  { name: "Albania", iso2: "AL", iso3: "ALB", dial: "355", currency: "ALL" },
  { name: "Algeria", iso2: "DZ", iso3: "DZA", dial: "213", currency: "DZD" },
  { name: "Andorra", iso2: "AD", iso3: "AND", dial: "376", currency: "EUR" },
  { name: "Angola", iso2: "AO", iso3: "AGO", dial: "244", currency: "AOA" },
  { name: "Antigua and Barbuda", iso2: "AG", iso3: "ATG", dial: "1268", currency: "XCD" },
  { name: "Argentina", iso2: "AR", iso3: "ARG", dial: "54", currency: "ARS" },
  { name: "Armenia", iso2: "AM", iso3: "ARM", dial: "374", currency: "AMD" },
  { name: "Australia", iso2: "AU", iso3: "AUS", dial: "61", currency: "AUD" },
  { name: "Austria", iso2: "AT", iso3: "AUT", dial: "43", currency: "EUR" },
  { name: "Azerbaijan", iso2: "AZ", iso3: "AZE", dial: "994", currency: "AZN" },
  { name: "Bahamas", iso2: "BS", iso3: "BHS", dial: "1242", currency: "BSD" },
  { name: "Bahrain", iso2: "BH", iso3: "BHR", dial: "973", currency: "BHD" },
  { name: "Bangladesh", iso2: "BD", iso3: "BGD", dial: "880", currency: "BDT" },
  { name: "Barbados", iso2: "BB", iso3: "BRB", dial: "1246", currency: "BBD" },
  { name: "Belarus", iso2: "BY", iso3: "BLR", dial: "375", currency: "BYN" },
  { name: "Belgium", iso2: "BE", iso3: "BEL", dial: "32", currency: "EUR" },
  { name: "Belize", iso2: "BZ", iso3: "BLZ", dial: "501", currency: "BZD" },
  { name: "Benin", iso2: "BJ", iso3: "BEN", dial: "229", currency: "XOF" },
  { name: "Bhutan", iso2: "BT", iso3: "BTN", dial: "975", currency: "BTN" },
  { name: "Bolivia", iso2: "BO", iso3: "BOL", dial: "591", currency: "BOB" },
  { name: "Bosnia and Herzegovina", iso2: "BA", iso3: "BIH", dial: "387", currency: "BAM" },
  { name: "Botswana", iso2: "BW", iso3: "BWA", dial: "267", currency: "BWP" },
  { name: "Brazil", iso2: "BR", iso3: "BRA", dial: "55", currency: "BRL" },
  { name: "Brunei", iso2: "BN", iso3: "BRN", dial: "673", currency: "BND" },
  { name: "Bulgaria", iso2: "BG", iso3: "BGR", dial: "359", currency: "BGN" },
  { name: "Burkina Faso", iso2: "BF", iso3: "BFA", dial: "226", currency: "XOF" },
  { name: "Burundi", iso2: "BI", iso3: "BDI", dial: "257", currency: "BIF" },
  { name: "Cambodia", iso2: "KH", iso3: "KHM", dial: "855", currency: "KHR" },
  { name: "Cameroon", iso2: "CM", iso3: "CMR", dial: "237", currency: "XAF" },
  { name: "Canada", iso2: "CA", iso3: "CAN", dial: "1", currency: "CAD" },
  { name: "Cape Verde", iso2: "CV", iso3: "CPV", dial: "238", currency: "CVE" },
  { name: "Central African Republic", iso2: "CF", iso3: "CAF", dial: "236", currency: "XAF" },
  { name: "Chad", iso2: "TD", iso3: "TCD", dial: "235", currency: "XAF" },
  { name: "Chile", iso2: "CL", iso3: "CHL", dial: "56", currency: "CLP" },
  { name: "China", iso2: "CN", iso3: "CHN", dial: "86", currency: "CNY" },
  { name: "Colombia", iso2: "CO", iso3: "COL", dial: "57", currency: "COP" },
  { name: "Comoros", iso2: "KM", iso3: "COM", dial: "269", currency: "KMF" },
  { name: "Congo (Brazzaville)", iso2: "CG", iso3: "COG", dial: "242", currency: "XAF" },
  { name: "Congo (Kinshasa)", iso2: "CD", iso3: "COD", dial: "243", currency: "CDF" },
  { name: "Costa Rica", iso2: "CR", iso3: "CRI", dial: "506", currency: "CRC" },
  { name: "Croatia", iso2: "HR", iso3: "HRV", dial: "385", currency: "EUR" },
  { name: "Cuba", iso2: "CU", iso3: "CUB", dial: "53", currency: "CUP" },
  { name: "Cyprus", iso2: "CY", iso3: "CYP", dial: "357", currency: "EUR" },
  { name: "Czech Republic", iso2: "CZ", iso3: "CZE", dial: "420", currency: "CZK" },
  { name: "Denmark", iso2: "DK", iso3: "DNK", dial: "45", currency: "DKK" },
  { name: "Djibouti", iso2: "DJ", iso3: "DJI", dial: "253", currency: "DJF" },
  { name: "Dominica", iso2: "DM", iso3: "DMA", dial: "1767", currency: "XCD" },
  { name: "Dominican Republic", iso2: "DO", iso3: "DOM", dial: "1809", currency: "DOP" },
  { name: "Ecuador", iso2: "EC", iso3: "ECU", dial: "593", currency: "USD" },
  { name: "Egypt", iso2: "EG", iso3: "EGY", dial: "20", currency: "EGP" },
  { name: "El Salvador", iso2: "SV", iso3: "SLV", dial: "503", currency: "USD" },
  { name: "Equatorial Guinea", iso2: "GQ", iso3: "GNQ", dial: "240", currency: "XAF" },
  { name: "Eritrea", iso2: "ER", iso3: "ERI", dial: "291", currency: "ERN" },
  { name: "Estonia", iso2: "EE", iso3: "EST", dial: "372", currency: "EUR" },
  { name: "Eswatini", iso2: "SZ", iso3: "SWZ", dial: "268", currency: "SZL" },
  { name: "Ethiopia", iso2: "ET", iso3: "ETH", dial: "251", currency: "ETB" },
  { name: "Fiji", iso2: "FJ", iso3: "FJI", dial: "679", currency: "FJD" },
  { name: "Finland", iso2: "FI", iso3: "FIN", dial: "358", currency: "EUR" },
  { name: "France", iso2: "FR", iso3: "FRA", dial: "33", currency: "EUR" },
  { name: "Gabon", iso2: "GA", iso3: "GAB", dial: "241", currency: "XAF" },
  { name: "Gambia", iso2: "GM", iso3: "GMB", dial: "220", currency: "GMD" },
  { name: "Georgia", iso2: "GE", iso3: "GEO", dial: "995", currency: "GEL" },
  { name: "Germany", iso2: "DE", iso3: "DEU", dial: "49", currency: "EUR" },
  { name: "Ghana", iso2: "GH", iso3: "GHA", dial: "233", currency: "GHS" },
  { name: "Greece", iso2: "GR", iso3: "GRC", dial: "30", currency: "EUR" },
  { name: "Grenada", iso2: "GD", iso3: "GRD", dial: "1473", currency: "XCD" },
  { name: "Guatemala", iso2: "GT", iso3: "GTM", dial: "502", currency: "GTQ" },
  { name: "Guinea", iso2: "GN", iso3: "GIN", dial: "224", currency: "GNF" },
  { name: "Guinea-Bissau", iso2: "GW", iso3: "GNB", dial: "245", currency: "XOF" },
  { name: "Guyana", iso2: "GY", iso3: "GUY", dial: "592", currency: "GYD" },
  { name: "Haiti", iso2: "HT", iso3: "HTI", dial: "509", currency: "HTG" },
  { name: "Honduras", iso2: "HN", iso3: "HND", dial: "504", currency: "HNL" },
  { name: "Hungary", iso2: "HU", iso3: "HUN", dial: "36", currency: "HUF" },
  { name: "Iceland", iso2: "IS", iso3: "ISL", dial: "354", currency: "ISK" },
  { name: "India", iso2: "IN", iso3: "IND", dial: "91", currency: "INR" },
  { name: "Indonesia", iso2: "ID", iso3: "IDN", dial: "62", currency: "IDR" },
  { name: "Iran", iso2: "IR", iso3: "IRN", dial: "98", currency: "IRR" },
  { name: "Iraq", iso2: "IQ", iso3: "IRQ", dial: "964", currency: "IQD" },
  { name: "Ireland", iso2: "IE", iso3: "IRL", dial: "353", currency: "EUR" },
  { name: "Israel", iso2: "IL", iso3: "ISR", dial: "972", currency: "ILS" },
  { name: "Italy", iso2: "IT", iso3: "ITA", dial: "39", currency: "EUR" },
  { name: "Ivory Coast", iso2: "CI", iso3: "CIV", dial: "225", currency: "XOF" },
  { name: "Jamaica", iso2: "JM", iso3: "JAM", dial: "1876", currency: "JMD" },
  { name: "Japan", iso2: "JP", iso3: "JPN", dial: "81", currency: "JPY" },
  { name: "Jordan", iso2: "JO", iso3: "JOR", dial: "962", currency: "JOD" },
  { name: "Kazakhstan", iso2: "KZ", iso3: "KAZ", dial: "7", currency: "KZT" },
  { name: "Kenya", iso2: "KE", iso3: "KEN", dial: "254", currency: "KES" },
  { name: "Kiribati", iso2: "KI", iso3: "KIR", dial: "686", currency: "AUD" },
  { name: "Kosovo", iso2: "XK", iso3: "XKX", dial: "383", currency: "EUR" },
  { name: "Kuwait", iso2: "KW", iso3: "KWT", dial: "965", currency: "KWD" },
  { name: "Kyrgyzstan", iso2: "KG", iso3: "KGZ", dial: "996", currency: "KGS" },
  { name: "Laos", iso2: "LA", iso3: "LAO", dial: "856", currency: "LAK" },
  { name: "Latvia", iso2: "LV", iso3: "LVA", dial: "371", currency: "EUR" },
  { name: "Lebanon", iso2: "LB", iso3: "LBN", dial: "961", currency: "LBP" },
  { name: "Lesotho", iso2: "LS", iso3: "LSO", dial: "266", currency: "LSL" },
  { name: "Liberia", iso2: "LR", iso3: "LBR", dial: "231", currency: "LRD" },
  { name: "Libya", iso2: "LY", iso3: "LBY", dial: "218", currency: "LYD" },
  { name: "Liechtenstein", iso2: "LI", iso3: "LIE", dial: "423", currency: "CHF" },
  { name: "Lithuania", iso2: "LT", iso3: "LTU", dial: "370", currency: "EUR" },
  { name: "Luxembourg", iso2: "LU", iso3: "LUX", dial: "352", currency: "EUR" },
  { name: "Madagascar", iso2: "MG", iso3: "MDG", dial: "261", currency: "MGA" },
  { name: "Malawi", iso2: "MW", iso3: "MWI", dial: "265", currency: "MWK" },
  { name: "Malaysia", iso2: "MY", iso3: "MYS", dial: "60", currency: "MYR" },
  { name: "Maldives", iso2: "MV", iso3: "MDV", dial: "960", currency: "MVR" },
  { name: "Mali", iso2: "ML", iso3: "MLI", dial: "223", currency: "XOF" },
  { name: "Malta", iso2: "MT", iso3: "MLT", dial: "356", currency: "EUR" },
  { name: "Marshall Islands", iso2: "MH", iso3: "MHL", dial: "692", currency: "USD" },
  { name: "Mauritania", iso2: "MR", iso3: "MRT", dial: "222", currency: "MRU" },
  { name: "Mauritius", iso2: "MU", iso3: "MUS", dial: "230", currency: "MUR" },
  { name: "Mexico", iso2: "MX", iso3: "MEX", dial: "52", currency: "MXN" },
  { name: "Micronesia", iso2: "FM", iso3: "FSM", dial: "691", currency: "USD" },
  { name: "Moldova", iso2: "MD", iso3: "MDA", dial: "373", currency: "MDL" },
  { name: "Monaco", iso2: "MC", iso3: "MCO", dial: "377", currency: "EUR" },
  { name: "Mongolia", iso2: "MN", iso3: "MNG", dial: "976", currency: "MNT" },
  { name: "Montenegro", iso2: "ME", iso3: "MNE", dial: "382", currency: "EUR" },
  { name: "Morocco", iso2: "MA", iso3: "MAR", dial: "212", currency: "MAD" },
  { name: "Mozambique", iso2: "MZ", iso3: "MOZ", dial: "258", currency: "MZN" },
  { name: "Myanmar", iso2: "MM", iso3: "MMR", dial: "95", currency: "MMK" },
  { name: "Namibia", iso2: "NA", iso3: "NAM", dial: "264", currency: "NAD" },
  { name: "Nauru", iso2: "NR", iso3: "NRU", dial: "674", currency: "AUD" },
  { name: "Nepal", iso2: "NP", iso3: "NPL", dial: "977", currency: "NPR" },
  { name: "Netherlands", iso2: "NL", iso3: "NLD", dial: "31", currency: "EUR" },
  { name: "New Zealand", iso2: "NZ", iso3: "NZL", dial: "64", currency: "NZD" },
  { name: "Nicaragua", iso2: "NI", iso3: "NIC", dial: "505", currency: "NIO" },
  { name: "Niger", iso2: "NE", iso3: "NER", dial: "227", currency: "XOF" },
  { name: "Nigeria", iso2: "NG", iso3: "NGA", dial: "234", currency: "NGN" },
  { name: "North Korea", iso2: "KP", iso3: "PRK", dial: "850", currency: "KPW" },
  { name: "North Macedonia", iso2: "MK", iso3: "MKD", dial: "389", currency: "MKD" },
  { name: "Norway", iso2: "NO", iso3: "NOR", dial: "47", currency: "NOK" },
  { name: "Oman", iso2: "OM", iso3: "OMN", dial: "968", currency: "OMR" },
  { name: "Pakistan", iso2: "PK", iso3: "PAK", dial: "92", currency: "PKR" },
  { name: "Palau", iso2: "PW", iso3: "PLW", dial: "680", currency: "USD" },
  { name: "Palestine", iso2: "PS", iso3: "PSE", dial: "970", currency: "ILS" },
  { name: "Panama", iso2: "PA", iso3: "PAN", dial: "507", currency: "PAB" },
  { name: "Papua New Guinea", iso2: "PG", iso3: "PNG", dial: "675", currency: "PGK" },
  { name: "Paraguay", iso2: "PY", iso3: "PRY", dial: "595", currency: "PYG" },
  { name: "Peru", iso2: "PE", iso3: "PER", dial: "51", currency: "PEN" },
  { name: "Philippines", iso2: "PH", iso3: "PHL", dial: "63", currency: "PHP" },
  { name: "Poland", iso2: "PL", iso3: "POL", dial: "48", currency: "PLN" },
  { name: "Portugal", iso2: "PT", iso3: "PRT", dial: "351", currency: "EUR" },
  { name: "Qatar", iso2: "QA", iso3: "QAT", dial: "974", currency: "QAR" },
  { name: "Romania", iso2: "RO", iso3: "ROU", dial: "40", currency: "RON" },
  { name: "Russia", iso2: "RU", iso3: "RUS", dial: "7", currency: "RUB" },
  { name: "Rwanda", iso2: "RW", iso3: "RWA", dial: "250", currency: "RWF" },
  { name: "Saint Kitts and Nevis", iso2: "KN", iso3: "KNA", dial: "1869", currency: "XCD" },
  { name: "Saint Lucia", iso2: "LC", iso3: "LCA", dial: "1758", currency: "XCD" },
  { name: "Saint Vincent and the Grenadines", iso2: "VC", iso3: "VCT", dial: "1784", currency: "XCD" },
  { name: "Samoa", iso2: "WS", iso3: "WSM", dial: "685", currency: "WST" },
  { name: "San Marino", iso2: "SM", iso3: "SMR", dial: "378", currency: "EUR" },
  { name: "Sao Tome and Principe", iso2: "ST", iso3: "STP", dial: "239", currency: "STN" },
  { name: "Saudi Arabia", iso2: "SA", iso3: "SAU", dial: "966", currency: "SAR" },
  { name: "Senegal", iso2: "SN", iso3: "SEN", dial: "221", currency: "XOF" },
  { name: "Serbia", iso2: "RS", iso3: "SRB", dial: "381", currency: "RSD" },
  { name: "Seychelles", iso2: "SC", iso3: "SYC", dial: "248", currency: "SCR" },
  { name: "Sierra Leone", iso2: "SL", iso3: "SLE", dial: "232", currency: "SLE" },
  { name: "Singapore", iso2: "SG", iso3: "SGP", dial: "65", currency: "SGD" },
  { name: "Slovakia", iso2: "SK", iso3: "SVK", dial: "421", currency: "EUR" },
  { name: "Slovenia", iso2: "SI", iso3: "SVN", dial: "386", currency: "EUR" },
  { name: "Solomon Islands", iso2: "SB", iso3: "SLB", dial: "677", currency: "SBD" },
  { name: "Somalia", iso2: "SO", iso3: "SOM", dial: "252", currency: "SOS" },
  { name: "South Africa", iso2: "ZA", iso3: "ZAF", dial: "27", currency: "ZAR" },
  { name: "South Korea", iso2: "KR", iso3: "KOR", dial: "82", currency: "KRW" },
  { name: "South Sudan", iso2: "SS", iso3: "SSD", dial: "211", currency: "SSP" },
  { name: "Spain", iso2: "ES", iso3: "ESP", dial: "34", currency: "EUR" },
  { name: "Sri Lanka", iso2: "LK", iso3: "LKA", dial: "94", currency: "LKR" },
  { name: "Sudan", iso2: "SD", iso3: "SDN", dial: "249", currency: "SDG" },
  { name: "Suriname", iso2: "SR", iso3: "SUR", dial: "597", currency: "SRD" },
  { name: "Sweden", iso2: "SE", iso3: "SWE", dial: "46", currency: "SEK" },
  { name: "Switzerland", iso2: "CH", iso3: "CHE", dial: "41", currency: "CHF" },
  { name: "Syria", iso2: "SY", iso3: "SYR", dial: "963", currency: "SYP" },
  { name: "Taiwan", iso2: "TW", iso3: "TWN", dial: "886", currency: "TWD" },
  { name: "Tajikistan", iso2: "TJ", iso3: "TJK", dial: "992", currency: "TJS" },
  { name: "Tanzania", iso2: "TZ", iso3: "TZA", dial: "255", currency: "TZS" },
  { name: "Thailand", iso2: "TH", iso3: "THA", dial: "66", currency: "THB" },
  { name: "Timor-Leste", iso2: "TL", iso3: "TLS", dial: "670", currency: "USD" },
  { name: "Togo", iso2: "TG", iso3: "TGO", dial: "228", currency: "XOF" },
  { name: "Tonga", iso2: "TO", iso3: "TON", dial: "676", currency: "TOP" },
  { name: "Trinidad and Tobago", iso2: "TT", iso3: "TTO", dial: "1868", currency: "TTD" },
  { name: "Tunisia", iso2: "TN", iso3: "TUN", dial: "216", currency: "TND" },
  { name: "Turkey", iso2: "TR", iso3: "TUR", dial: "90", currency: "TRY" },
  { name: "Turkmenistan", iso2: "TM", iso3: "TKM", dial: "993", currency: "TMT" },
  { name: "Tuvalu", iso2: "TV", iso3: "TUV", dial: "688", currency: "AUD" },
  { name: "Uganda", iso2: "UG", iso3: "UGA", dial: "256", currency: "UGX" },
  { name: "Ukraine", iso2: "UA", iso3: "UKR", dial: "380", currency: "UAH" },
  { name: "United Arab Emirates", iso2: "AE", iso3: "ARE", dial: "971", currency: "AED" },
  { name: "United Kingdom", iso2: "GB", iso3: "GBR", dial: "44", currency: "GBP" },
  { name: "United States", iso2: "US", iso3: "USA", dial: "1", currency: "USD" },
  { name: "Uruguay", iso2: "UY", iso3: "URY", dial: "598", currency: "UYU" },
  { name: "Uzbekistan", iso2: "UZ", iso3: "UZB", dial: "998", currency: "UZS" },
  { name: "Vanuatu", iso2: "VU", iso3: "VUT", dial: "678", currency: "VUV" },
  { name: "Vatican City", iso2: "VA", iso3: "VAT", dial: "379", currency: "EUR" },
  { name: "Venezuela", iso2: "VE", iso3: "VEN", dial: "58", currency: "VES" },
  { name: "Vietnam", iso2: "VN", iso3: "VNM", dial: "84", currency: "VND" },
  { name: "Yemen", iso2: "YE", iso3: "YEM", dial: "967", currency: "YER" },
  { name: "Zambia", iso2: "ZM", iso3: "ZMB", dial: "260", currency: "ZMW" },
  { name: "Zimbabwe", iso2: "ZW", iso3: "ZWE", dial: "263", currency: "ZWL" },
];

export const CURRENCIES: Currency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", decimals: 0 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", decimals: 0 },
  { code: "RWF", name: "Rwandan Franc", symbol: "FRw", decimals: 0 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2 },
  { code: "AFN", name: "Afghan Afghani", symbol: "؋", decimals: 2 },
  { code: "ALL", name: "Albanian Lek", symbol: "L", decimals: 2 },
  { code: "AMD", name: "Armenian Dram", symbol: "֏", decimals: 2 },
  { code: "AOA", name: "Angolan Kwanza", symbol: "Kz", decimals: 2 },
  { code: "ARS", name: "Argentine Peso", symbol: "$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "AZN", name: "Azerbaijani Manat", symbol: "₼", decimals: 2 },
  { code: "BAM", name: "Bosnia Convertible Mark", symbol: "KM", decimals: 2 },
  { code: "BBD", name: "Barbadian Dollar", symbol: "Bds$", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", decimals: 2 },
  { code: "BHD", name: "Bahraini Dinar", symbol: ".د.ب", decimals: 3 },
  { code: "BIF", name: "Burundian Franc", symbol: "FBu", decimals: 0 },
  { code: "BMD", name: "Bermudian Dollar", symbol: "$", decimals: 2 },
  { code: "BND", name: "Brunei Dollar", symbol: "$", decimals: 2 },
  { code: "BOB", name: "Bolivian Boliviano", symbol: "Bs.", decimals: 2 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "BSD", name: "Bahamian Dollar", symbol: "$", decimals: 2 },
  { code: "BTN", name: "Bhutanese Ngultrum", symbol: "Nu.", decimals: 2 },
  { code: "BWP", name: "Botswana Pula", symbol: "P", decimals: 2 },
  { code: "BYN", name: "Belarusian Ruble", symbol: "Br", decimals: 2 },
  { code: "BZD", name: "Belize Dollar", symbol: "BZ$", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  { code: "CDF", name: "Congolese Franc", symbol: "FC", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "CLP", name: "Chilean Peso", symbol: "$", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "COP", name: "Colombian Peso", symbol: "$", decimals: 2 },
  { code: "CRC", name: "Costa Rican Colon", symbol: "₡", decimals: 2 },
  { code: "CUP", name: "Cuban Peso", symbol: "₱", decimals: 2 },
  { code: "CVE", name: "Cape Verdean Escudo", symbol: "$", decimals: 2 },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", decimals: 2 },
  { code: "DJF", name: "Djiboutian Franc", symbol: "Fdj", decimals: 0 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "DOP", name: "Dominican Peso", symbol: "RD$", decimals: 2 },
  { code: "DZD", name: "Algerian Dinar", symbol: "دج", decimals: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "£", decimals: 2 },
  { code: "ERN", name: "Eritrean Nakfa", symbol: "Nfk", decimals: 2 },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br", decimals: 2 },
  { code: "FJD", name: "Fijian Dollar", symbol: "FJ$", decimals: 2 },
  { code: "GEL", name: "Georgian Lari", symbol: "₾", decimals: 2 },
  { code: "GMD", name: "Gambian Dalasi", symbol: "D", decimals: 2 },
  { code: "GNF", name: "Guinean Franc", symbol: "FG", decimals: 0 },
  { code: "GTQ", name: "Guatemalan Quetzal", symbol: "Q", decimals: 2 },
  { code: "GYD", name: "Guyanese Dollar", symbol: "$", decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2 },
  { code: "HNL", name: "Honduran Lempira", symbol: "L", decimals: 2 },
  { code: "HTG", name: "Haitian Gourde", symbol: "G", decimals: 2 },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", decimals: 0 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 0 },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "IQD", name: "Iraqi Dinar", symbol: "ع.د", decimals: 3 },
  { code: "IRR", name: "Iranian Rial", symbol: "﷼", decimals: 2 },
  { code: "ISK", name: "Icelandic Krona", symbol: "kr", decimals: 0 },
  { code: "JMD", name: "Jamaican Dollar", symbol: "J$", decimals: 2 },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD", decimals: 3 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "KGS", name: "Kyrgyzstani Som", symbol: "с", decimals: 2 },
  { code: "KHR", name: "Cambodian Riel", symbol: "៛", decimals: 2 },
  { code: "KMF", name: "Comorian Franc", symbol: "CF", decimals: 0 },
  { code: "KPW", name: "North Korean Won", symbol: "₩", decimals: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", decimals: 3 },
  { code: "KZT", name: "Kazakhstani Tenge", symbol: "₸", decimals: 2 },
  { code: "LAK", name: "Lao Kip", symbol: "₭", decimals: 2 },
  { code: "LBP", name: "Lebanese Pound", symbol: "£", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "₨", decimals: 2 },
  { code: "LRD", name: "Liberian Dollar", symbol: "$", decimals: 2 },
  { code: "LSL", name: "Lesotho Loti", symbol: "L", decimals: 2 },
  { code: "LYD", name: "Libyan Dinar", symbol: "LD", decimals: 3 },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH", decimals: 2 },
  { code: "MDL", name: "Moldovan Leu", symbol: "L", decimals: 2 },
  { code: "MGA", name: "Malagasy Ariary", symbol: "Ar", decimals: 2 },
  { code: "MKD", name: "Macedonian Denar", symbol: "ден", decimals: 2 },
  { code: "MMK", name: "Myanmar Kyat", symbol: "K", decimals: 2 },
  { code: "MNT", name: "Mongolian Tugrik", symbol: "₮", decimals: 2 },
  { code: "MOP", name: "Macanese Pataca", symbol: "MOP$", decimals: 2 },
  { code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM", decimals: 2 },
  { code: "MUR", name: "Mauritian Rupee", symbol: "₨", decimals: 2 },
  { code: "MVR", name: "Maldivian Rufiyaa", symbol: "Rf", decimals: 2 },
  { code: "MWK", name: "Malawian Kwacha", symbol: "MK", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "$", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
  { code: "MZN", name: "Mozambican Metical", symbol: "MT", decimals: 2 },
  { code: "NAD", name: "Namibian Dollar", symbol: "$", decimals: 2 },
  { code: "NIO", name: "Nicaraguan Cordoba", symbol: "C$", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "NPR", name: "Nepalese Rupee", symbol: "₨", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  { code: "OMR", name: "Omani Rial", symbol: "﷼", decimals: 3 },
  { code: "PAB", name: "Panamanian Balboa", symbol: "B/.", decimals: 2 },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/", decimals: 2 },
  { code: "PGK", name: "Papua New Guinean Kina", symbol: "K", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 2 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", decimals: 2 },
  { code: "PYG", name: "Paraguayan Guarani", symbol: "Gs", decimals: 0 },
  { code: "QAR", name: "Qatari Riyal", symbol: "QR", decimals: 2 },
  { code: "RON", name: "Romanian Leu", symbol: "lei", decimals: 2 },
  { code: "RSD", name: "Serbian Dinar", symbol: "din", decimals: 2 },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", decimals: 2 },
  { code: "SBD", name: "Solomon Islands Dollar", symbol: "SI$", decimals: 2 },
  { code: "SCR", name: "Seychellois Rupee", symbol: "₨", decimals: 2 },
  { code: "SDG", name: "Sudanese Pound", symbol: "ج.س.", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "SLE", name: "Sierra Leonean Leone", symbol: "Le", decimals: 2 },
  { code: "SOS", name: "Somali Shilling", symbol: "S", decimals: 2 },
  { code: "SRD", name: "Surinamese Dollar", symbol: "$", decimals: 2 },
  { code: "SSP", name: "South Sudanese Pound", symbol: "£", decimals: 2 },
  { code: "STN", name: "Sao Tome Dobra", symbol: "Db", decimals: 2 },
  { code: "SYP", name: "Syrian Pound", symbol: "£", decimals: 2 },
  { code: "SZL", name: "Eswatini Lilangeni", symbol: "L", decimals: 2 },
  { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2 },
  { code: "TJS", name: "Tajikistani Somoni", symbol: "SM", decimals: 2 },
  { code: "TMT", name: "Turkmenistani Manat", symbol: "T", decimals: 2 },
  { code: "TND", name: "Tunisian Dinar", symbol: "DT", decimals: 3 },
  { code: "TOP", name: "Tongan Paanga", symbol: "T$", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "TTD", name: "Trinidad Tobago Dollar", symbol: "TT$", decimals: 2 },
  { code: "TWD", name: "Taiwan Dollar", symbol: "NT$", decimals: 2 },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴", decimals: 2 },
  { code: "UYU", name: "Uruguayan Peso", symbol: "$U", decimals: 2 },
  { code: "UZS", name: "Uzbekistani Som", symbol: "so'm", decimals: 2 },
  { code: "VES", name: "Venezuelan Bolivar", symbol: "Bs.S", decimals: 2 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimals: 0 },
  { code: "VUV", name: "Vanuatu Vatu", symbol: "VT", decimals: 0 },
  { code: "WST", name: "Samoan Tala", symbol: "WS$", decimals: 2 },
  { code: "XAF", name: "Central African Franc", symbol: "FCFA", decimals: 0 },
  { code: "XCD", name: "East Caribbean Dollar", symbol: "EC$", decimals: 2 },
  { code: "XOF", name: "West African Franc", symbol: "CFA", decimals: 0 },
  { code: "YER", name: "Yemeni Rial", symbol: "﷼", decimals: 2 },
  { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", decimals: 2 },
  { code: "ZWL", name: "Zimbabwean Dollar", symbol: "Z$", decimals: 2 },
];

export const BUSINESS_TYPES = [
  "Retail",
  "Retail Shop",
  "Wholesale",
  "Grocery / Supermarket",
  "Restaurant / Cafe",
  "Salon / Barbershop",
  "Pharmacy",
  "Hardware",
  "Electronics",
  "Fashion / Boutique",
  "Stationery / Bookshop",
  "Agrovet / Farm Supply",
  "Motor Spares / Garage",
  "Services",
  "Manufacturing",
  "Other",
];

export type GroupingSystem = "western" | "indian";

export const DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY — 31/12/2026" },
  { value: "DD MMM YYYY", label: "DD MMM YYYY — 31 Dec 2026" },
  { value: "DD MMMM YYYY", label: "DD MMMM YYYY — 31 December 2026" },
  { value: "D MMM YYYY", label: "Short date — 7 Nov / 7 Nov 2026" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY — 12/31/2026" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD — 2026-12-31" },
] as const;

export const GROUPING_SYSTEMS: { id: GroupingSystem; label: string; example: string }[] = [
  { id: "western", label: "Western — 99,999,999,999.00", example: "99,999,999,999.00" },
  { id: "indian", label: "Indian — 9,99,99,99,999.00", example: "9,99,99,99,999.00" },
];

export const SEPARATOR_PRESETS = [
  { id: "us", label: "1,234,567.89 (US / UK)", thousand: ",", decimal: "." },
  { id: "eu", label: "1.234.567,89 (Germany / Italy)", thousand: ".", decimal: "," },
  { id: "fr", label: "1 234 567,89 (France)", thousand: " ", decimal: "," },
  { id: "ch", label: "1'234'567.89 (Switzerland)", thousand: "'", decimal: "." },
];

export const TIMEZONES = [
  "UTC",
  "Africa/Abidjan", "Africa/Accra", "Africa/Addis_Ababa", "Africa/Algiers", "Africa/Cairo",
  "Africa/Casablanca", "Africa/Dakar", "Africa/Dar_es_Salaam", "Africa/Johannesburg",
  "Africa/Juba", "Africa/Kampala", "Africa/Khartoum", "Africa/Kigali", "Africa/Lagos",
  "Africa/Nairobi", "Africa/Tripoli", "Africa/Tunis",
  "America/Anchorage", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Caracas",
  "America/Chicago", "America/Denver", "America/Halifax", "America/Havana", "America/Jamaica",
  "America/La_Paz", "America/Lima", "America/Los_Angeles", "America/Mexico_City",
  "America/New_York", "America/Panama", "America/Santiago", "America/Sao_Paulo",
  "America/St_Johns", "America/Toronto",
  "Asia/Almaty", "Asia/Amman", "Asia/Baghdad", "Asia/Bahrain", "Asia/Baku", "Asia/Bangkok",
  "Asia/Beirut", "Asia/Colombo", "Asia/Dhaka", "Asia/Dubai", "Asia/Gaza", "Asia/Hong_Kong",
  "Asia/Jakarta", "Asia/Jerusalem", "Asia/Kabul", "Asia/Karachi", "Asia/Kathmandu",
  "Asia/Kolkata", "Asia/Kuala_Lumpur", "Asia/Kuwait", "Asia/Manila", "Asia/Muscat",
  "Asia/Nicosia", "Asia/Qatar", "Asia/Riyadh", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore",
  "Asia/Taipei", "Asia/Tashkent", "Asia/Tbilisi", "Asia/Tehran", "Asia/Tokyo", "Asia/Yangon",
  "Australia/Adelaide", "Australia/Brisbane", "Australia/Darwin", "Australia/Melbourne",
  "Australia/Perth", "Australia/Sydney",
  "Europe/Amsterdam", "Europe/Athens", "Europe/Belgrade", "Europe/Berlin", "Europe/Brussels",
  "Europe/Bucharest", "Europe/Budapest", "Europe/Copenhagen", "Europe/Dublin", "Europe/Helsinki",
  "Europe/Istanbul", "Europe/Kiev", "Europe/Lisbon", "Europe/London", "Europe/Madrid",
  "Europe/Moscow", "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Rome",
  "Europe/Stockholm", "Europe/Vienna", "Europe/Warsaw", "Europe/Zurich",
  "Pacific/Auckland", "Pacific/Fiji", "Pacific/Guam", "Pacific/Honolulu", "Pacific/Port_Moresby",
];

/** "GMT+03:00 Africa/Kampala" — GMT prefix first, IANA name second. */
export function timezoneLabel(tz: string): string {
  if (tz === "UTC") return "GMT+0 UTC";
  // The continent is noise in a shop's dropdown: "GMT+3 Kampala" reads
  // faster than "GMT+03:00 Africa/Kampala".
  const city = tz.split("/").slice(1).join("/").replace(/_/g, " ") || tz;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (name === "GMT") return `GMT+0 ${city}`;
    const m = /GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(name);
    if (m) {
      const sign = m[1][0];
      const h = Math.abs(parseInt(m[1], 10));
      const mm = m[2] ?? "00";
      // "GMT+3", not "GMT+03:00"; half-hour zones keep their minutes.
      return `GMT${sign}${h}${mm === "00" ? "" : `:${mm}`} ${city}`;
    }
  } catch {
    /* unknown zone - fall through */
  }
  return city;
}

export const TIMEZONE_OPTIONS = TIMEZONES.map((z) => ({
  value: z,
  label: timezoneLabel(z),
}));

// ---------- helpers (used by onboarding + settings) ----------

export function countryByIso2(iso2: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso2 === iso2);
}

export function currencyByCode(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

/** "UG" -> flag emoji, for dropdown adornments. */
export function isoToFlag(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

/**
 * Baked-in flag image (public/flags/<iso2>.svg, shipped with the app —
 * works offline). Falls back gracefully wherever used.
 */
export function flagUrl(iso2: string): string {
  const base =
    typeof import.meta !== "undefined" && (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL
      ? String((import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL)
      : "/";
  return `${base}flags/${iso2.toLowerCase()}.svg`;
}

/** Validate an ISD-prefixed phone: digits (allow spaces/dashes), 4-15 digits after dial code. */
export function isValidPhone(dial: string, number: string): boolean {
  const digits = number.replace(/\D/g, "");
  return /^\d+$/.test(dial) && digits.length >= 4 && digits.length <= 15;
}

/** Combine dial + number to E.164-ish "+256 712345678". */
export function formatPhone(dial: string, number: string): string {
  return `+${dial.replace(/\D/g, "")} ${number.replace(/[^\d]/g, "")}`.trim();
}

/** Split a stored "+256 712345678" phone into dial + rest for editors. */
export function splitPhone(full: string): { dial: string; number: string } {
  const m = /^\+(\d+)\s*(.*)$/.exec((full || "").trim());
  if (!m) return { dial: "", number: full || "" };
  return { dial: m[1], number: m[2] };
}

/** Join dial + rest back to storage format ("" when no digits). */
export function joinPhone(dial: string, number: string): string {
  const digits = (number || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return dial ? `+${dial.replace(/\D/g, "")} ${digits}` : digits;
}

export type MoneyFormat = {
  thousand: string;
  decimal: string;
  places: number;
  grouping: GroupingSystem;
  symbol?: string;
};

/** Format per shop settings, e.g. 99999999999 -> "99,999,999,999.00" (western) or Indian grouping. */
export function formatMoney(amount: number, fmt: MoneyFormat): string {
  const places = Math.min(4, Math.max(0, fmt.places));
  const fixed = Math.abs(amount).toFixed(places);
  const [intPart, fracPart] = fixed.split(".");
  let grouped: string;
  if (fmt.grouping === "indian") {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, fmt.thousand);
    grouped = (rest ? rest + fmt.thousand : "") + last3;
  } else {
    grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.thousand);
  }
  const sign = amount < 0 ? "-" : "";
  const sym = fmt.symbol ? fmt.symbol + " " : "";
  return `${sign}${sym}${grouped}${places > 0 ? fmt.decimal + (fracPart || "") : ""}`;
}

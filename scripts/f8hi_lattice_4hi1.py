"""4HI1 IGCSE History concept lattice — T-KG-PRE-17
(F8 rollout batch fifteen, the history family tranche 12;
serves igcse-history-17, 105 served points).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the
Edexcel 4HI1 IGCSE History specification, anchored to the served spine's
point ids. The spine is the specification's own two-tier register: Paper 1
depth studies (1 the French Revolution, 2 Italian unification, 3 Germany
1918-39, 4 India, 5 the USSR under Stalin, 6 the Cold War, 7 the USA civil
rights and protest, 8 South Africa apartheid) interleaved with Paper 2
investigation studies (A1 the First World War, B1 the US Civil War and
westward expansion, A2 Russia 1905-24, B2 medicine c1848-c1948, A3 the USA
1918-41, B3 Japan 1853-1930s, A4 Indochina, B4 China 1911-89, A5 the GDR,
B5 the UN, B6 the changing nature of warfare, B7 the Middle East, B8
Britain diversity-rights-equality). Each register is a dense
causes-events-consequences sentence, so the lattice is near-1:1 — all 105
points are anchored, none excluded — and the chains run causes ->
development -> consequences within each module, with honest cross-module
bridges only where the specification itself names the dependency (the
Ludendorff offensive's failure -> the German Revolution and abdication
registers; the NEP register -> Stalin's economic aims which name the NEP's
failings; the GDR's Wall origins -> the Cold War's Berlin Wall register;
Ostpolitik -> the thaw; the thaw treaties -> the nuclear arms race register;
the Cold War rivalry -> the Red Scare register). Two authored pairs sit in
knowingly served-order-reversed territory (westward expansion's opposition
-> the large/small-state tensions the expansion created, the expansion
register being served after the tensions register; the US Cold War doctrine
registers -> the Indochina Domino-Theory response register, the Cold War
study being served after the Indochina study); the calibrated in-order law
drops exactly those, counted and disclosed — the law working as designed.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # Paper 1, study 1 — the French Revolution
    "H1-1-LT-CAUSES": ["1.1"],
    "H1-1-ST-CAUSES": ["1.2"],
    "H1-1-CONSTITUENT": ["1.3"],
    "H1-1-CONVENTION": ["1.4"],
    "H1-1-THERMIDOR": ["1.5"],
    # Paper 2, A1 — the First World War
    "H1-A1-ALLIANCES": ["A1.1"],
    "H1-A1-BALKANS": ["A1.2"],
    "H1-A1-SCHLIEFFEN-TRENCHES": ["A1.3"],
    "H1-A1-NAVAL": ["A1.4"],
    "H1-A1-US-ENTRY-LUDENDORFF": ["A1.5"],
    # Paper 2, B1 — the US Civil War and westward expansion
    "H1-B1-TENSIONS-SLAVERY": ["B1.1"],
    "H1-B1-EXPANSION": ["B1.2"],
    "H1-B1-CONFLICT-1850": ["B1.3"],
    "H1-B1-CIVIL-WAR": ["B1.4"],
    "H1-B1-RECONSTRUCTION": ["B1.5"],
    # Paper 1, study 2 — Italian unification
    "H1-2-REV-1848": ["2.1"],
    "H1-2-PIEDMONT": ["2.2"],
    "H1-2-AUSTRIA-CRIMEA": ["2.3"],
    "H1-2-GARIBALDI": ["2.4"],
    "H1-2-OBSTACLES-1861": ["2.5"],
    # Paper 2, A2 — Russia 1905-24
    "H1-A2-TSAR-1905": ["A2.1"],
    "H1-A2-WWI-RUSSIA": ["A2.2"],
    "H1-A2-PROVISIONAL": ["A2.3"],
    "H1-A2-BOLSHEVIK-CONSOL": ["A2.4"],
    "H1-A2-WARCOM-NEP": ["A2.5"],
    # Paper 2, B2 — medicine c1848-c1948
    "H1-B2-BARRIERS": ["B2.1"],
    "H1-B2-PASTEUR": ["B2.2"],
    "H1-B2-KOCH-BACTERIOLOGY": ["B2.3"],
    "H1-B2-LIBERAL-PH": ["B2.4"],
    "H1-B2-FLOREY-CHAIN": ["B2.5"],
    # Paper 1, study 3 — Germany 1918-39
    "H1-3-ABDICATION-REPUBLIC": ["3.1"],
    "H1-3-STRESEMANN": ["3.2"],
    "H1-3-NSDAP-MUNICH": ["3.3"],
    "H1-3-DICTATORSHIP": ["3.4"],
    "H1-3-FINAL-SOLUTION": ["3.5"],
    # Paper 2, A3 — the USA 1918-41
    "H1-A3-BOOM": ["A3.1"],
    "H1-A3-IMMIGRATION-REDS": ["A3.2"],
    "H1-A3-CRASH-HOOVER": ["A3.3"],
    "H1-A3-FDR-NEWDEAL": ["A3.4"],
    "H1-A3-ND-OPPOSITION": ["A3.5"],
    # Paper 2, B3 — Japan 1853-1930s
    "H1-B3-PERRY": ["B3.1"],
    "H1-B3-TOKUGAWA-FALL": ["B3.2"],
    "H1-B3-MEIJI-INDUSTRIAL": ["B3.3"],
    "H1-B3-POLITICAL-CONFLICT": ["B3.4"],
    "H1-B3-MILITARISM": ["B3.5"],
    # Paper 1, study 4 — India
    "H1-4-WWI-NATIONALISM": ["4.1"],
    "H1-4-GANDHI": ["4.2"],
    "H1-4-SIMON-CONFLICT": ["4.3"],
    "H1-4-GANDHI-NEHRU-JINNAH": ["4.4"],
    "H1-4-SIMLA-LABOUR": ["4.5"],
    # Paper 2, A4 — Indochina
    "H1-A4-FIRST-WAR": ["A4.1"],
    "H1-A4-GENEVA-DOMINO": ["A4.2"],
    "H1-A4-SECOND-WAR": ["A4.3"],
    "H1-A4-PEACE-FAILURE": ["A4.4"],
    "H1-A4-CIVILIANS-GUERRILLA": ["A4.5"],
    # Paper 2, B4 — China 1911-89
    "H1-B4-BOXER-1911": ["B4.1"],
    "H1-B4-LONG-MARCH": ["B4.2"],
    "H1-B4-AGRI-INDUSTRY": ["B4.3"],
    "H1-B4-CULTURAL-REV": ["B4.4"],
    "H1-B4-DENG": ["B4.5"],
    # Paper 1, study 5 — the USSR under Stalin
    "H1-5-RIVALS": ["5.1"],
    "H1-5-ECONOMIC-AIMS": ["5.2"],
    "H1-5-PURGES": ["5.3"],
    "H1-5-LIVING-WORKING": ["5.4"],
    "H1-5-WWII-SURVIVAL": ["5.5"],
    # Paper 2, A5 — the GDR
    "H1-A5-WALL-ORIGINS": ["A5.1"],
    "H1-A5-STABILISATION": ["A5.2"],
    "H1-A5-DAILY-LIFE": ["A5.3"],
    "H1-A5-OSTPOLITIK": ["A5.4"],
    "H1-A5-GORBACHEV-1989": ["A5.5"],
    # Paper 2, B5 — the UN
    "H1-B5-LEAGUE-ORIGINS": ["B5.1"],
    "H1-B5-GREAT-POWERS-VETO": ["B5.2"],
    "H1-B5-UN-CHARTER": ["B5.3"],
    "H1-B5-UN-CASES-LIMITED": ["B5.4"],
    "H1-B5-UN-CASES-1990S": ["B5.5"],
    # Paper 1, study 6 — the Cold War
    "H1-6-RIVALRY-IDEOLOGY": ["6.1"],
    "H1-6-EXPANSION-CONTAINMENT": ["6.2"],
    "H1-6-KOREA-WP-COEXIST": ["6.3"],
    "H1-6-U2-WALL": ["6.4"],
    "H1-6-THAW": ["6.5"],
    # Paper 2, B6 — the changing nature of warfare
    "H1-B6-WWI-CHANGES": ["B6.1"],
    "H1-B6-BLITZKRIEG-BLITZ": ["B6.2"],
    "H1-B6-ATOMIC-NUCLEAR": ["B6.3"],
    "H1-B6-CONVENTIONAL-GULF": ["B6.4"],
    "H1-B6-HIGH-TECH": ["B6.5"],
    # Paper 1, study 7 — the USA: civil rights and protest
    "H1-7-RED-SCARE": ["7.1"],
    "H1-7-SEGREGATION": ["7.2"],
    "H1-7-CR-PROTESTS": ["7.3"],
    "H1-7-STUDENT-MOVEMENT": ["7.4"],
    "H1-7-WATERGATE": ["7.5"],
    # Paper 2, B7 — the Middle East
    "H1-B7-BALFOUR-MANDATE": ["B7.1"],
    "H1-B7-UN-PARTITION-1948": ["B7.2"],
    "H1-B7-NASSER-1967": ["B7.3"],
    "H1-B7-KISSINGER-CAMP-DAVID": ["B7.4"],
    "H1-B7-PEACE-PROCESS": ["B7.5"],
    # Paper 1, study 8 — South Africa
    "H1-8-1948-APARTHEID": ["8.1"],
    "H1-8-PETTY-APARTHEID": ["8.2"],
    "H1-8-RESISTANCE-MANDELA": ["8.3"],
    "H1-8-OPPOSITION-UDF": ["8.4"],
    "H1-8-DEKLERK-REFORMS": ["8.5"],
    # Paper 2, B8 — Britain: diversity, rights, equality
    "H1-B8-1914-DIVERSITY": ["B8.1"],
    "H1-B8-DEPRESSION-WAR": ["B8.2"],
    "H1-B8-WINDRUSH-IMMIGRANTS": ["B8.3"],
    "H1-B8-FEMINISM-EQUALITY": ["B8.4"],
    "H1-B8-EQUAL-RIGHTS-DRIVE": ["B8.5"],
}

EDGES = [
    # study 1 — the French Revolution chain
    ("H1-1-LT-CAUSES", "H1-1-ST-CAUSES", DD),
    ("H1-1-ST-CAUSES", "H1-1-CONSTITUENT", DD),
    ("H1-1-CONSTITUENT", "H1-1-CONVENTION", DD),
    ("H1-1-CONVENTION", "H1-1-THERMIDOR", DD),
    # A1 — the First World War chain
    ("H1-A1-ALLIANCES", "H1-A1-BALKANS", UWR),
    ("H1-A1-BALKANS", "H1-A1-SCHLIEFFEN-TRENCHES", UWR),
    ("H1-A1-SCHLIEFFEN-TRENCHES", "H1-A1-NAVAL", UWR),
    ("H1-A1-NAVAL", "H1-A1-US-ENTRY-LUDENDORFF", UWR),
    # B1 — the Civil War chain
    ("H1-B1-TENSIONS-SLAVERY", "H1-B1-CONFLICT-1850", DD),
    ("H1-B1-EXPANSION", "H1-B1-CONFLICT-1850", UWR),
    ("H1-B1-CONFLICT-1850", "H1-B1-CIVIL-WAR", DD),
    ("H1-B1-CIVIL-WAR", "H1-B1-RECONSTRUCTION", DD),
    # study 2 — Italian unification (fed by the 1848 revolutions register)
    ("H1-2-REV-1848", "H1-2-PIEDMONT", DD),
    ("H1-2-PIEDMONT", "H1-2-AUSTRIA-CRIMEA", DD),
    ("H1-2-AUSTRIA-CRIMEA", "H1-2-GARIBALDI", DD),
    ("H1-2-GARIBALDI", "H1-2-OBSTACLES-1861", DD),
    # A2 — Russia 1905-24
    ("H1-A2-TSAR-1905", "H1-A2-WWI-RUSSIA", DD),
    ("H1-A2-WWI-RUSSIA", "H1-A2-PROVISIONAL", DD),
    ("H1-A2-PROVISIONAL", "H1-A2-BOLSHEVIK-CONSOL", DD),
    ("H1-A2-BOLSHEVIK-CONSOL", "H1-A2-WARCOM-NEP", DD),
    # B2 — medicine
    ("H1-B2-BARRIERS", "H1-B2-PASTEUR", DD),
    ("H1-B2-PASTEUR", "H1-B2-KOCH-BACTERIOLOGY", DD),
    ("H1-B2-KOCH-BACTERIOLOGY", "H1-B2-LIBERAL-PH", UWR),
    ("H1-B2-LIBERAL-PH", "H1-B2-FLOREY-CHAIN", UWR),
    # study 3 — Germany 1918-39
    ("H1-3-ABDICATION-REPUBLIC", "H1-3-STRESEMANN", DD),
    ("H1-3-STRESEMANN", "H1-3-NSDAP-MUNICH", UWR),
    ("H1-3-NSDAP-MUNICH", "H1-3-DICTATORSHIP", DD),
    ("H1-3-DICTATORSHIP", "H1-3-FINAL-SOLUTION", DD),
    # A3 — the USA 1918-41
    ("H1-A3-BOOM", "H1-A3-IMMIGRATION-REDS", UWR),
    ("H1-A3-IMMIGRATION-REDS", "H1-A3-CRASH-HOOVER", UWR),
    ("H1-A3-CRASH-HOOVER", "H1-A3-FDR-NEWDEAL", DD),
    ("H1-A3-FDR-NEWDEAL", "H1-A3-ND-OPPOSITION", DD),
    # B3 — Japan
    ("H1-B3-PERRY", "H1-B3-TOKUGAWA-FALL", DD),
    ("H1-B3-TOKUGAWA-FALL", "H1-B3-MEIJI-INDUSTRIAL", DD),
    ("H1-B3-MEIJI-INDUSTRIAL", "H1-B3-POLITICAL-CONFLICT", UWR),
    ("H1-B3-POLITICAL-CONFLICT", "H1-B3-MILITARISM", DD),
    # study 4 — India
    ("H1-4-WWI-NATIONALISM", "H1-4-GANDHI", DD),
    ("H1-4-GANDHI", "H1-4-SIMON-CONFLICT", DD),
    ("H1-4-SIMON-CONFLICT", "H1-4-GANDHI-NEHRU-JINNAH", UWR),
    ("H1-4-GANDHI-NEHRU-JINNAH", "H1-4-SIMLA-LABOUR", DD),
    # A4 — Indochina
    ("H1-A4-FIRST-WAR", "H1-A4-GENEVA-DOMINO", DD),
    ("H1-A4-GENEVA-DOMINO", "H1-A4-SECOND-WAR", DD),
    ("H1-A4-SECOND-WAR", "H1-A4-PEACE-FAILURE", DD),
    ("H1-A4-PEACE-FAILURE", "H1-A4-CIVILIANS-GUERRILLA", UWR),
    # B4 — China
    ("H1-B4-BOXER-1911", "H1-B4-LONG-MARCH", UWR),
    ("H1-B4-LONG-MARCH", "H1-B4-AGRI-INDUSTRY", DD),
    ("H1-B4-AGRI-INDUSTRY", "H1-B4-CULTURAL-REV", DD),
    ("H1-B4-CULTURAL-REV", "H1-B4-DENG", DD),
    # study 5 — Stalin (the NEP register feeding the economic aims)
    ("H1-A2-WARCOM-NEP", "H1-5-ECONOMIC-AIMS", UWR),
    ("H1-5-RIVALS", "H1-5-ECONOMIC-AIMS", DD),
    ("H1-5-ECONOMIC-AIMS", "H1-5-PURGES", UWR),
    ("H1-5-PURGES", "H1-5-LIVING-WORKING", UWR),
    ("H1-5-LIVING-WORKING", "H1-5-WWII-SURVIVAL", UWR),
    # A5 — the GDR
    ("H1-A5-WALL-ORIGINS", "H1-A5-STABILISATION", DD),
    ("H1-A5-STABILISATION", "H1-A5-DAILY-LIFE", DD),
    ("H1-A5-DAILY-LIFE", "H1-A5-OSTPOLITIK", UWR),
    ("H1-A5-OSTPOLITIK", "H1-A5-GORBACHEV-1989", DD),
    # B5 — the UN (born of the League's failure)
    ("H1-B5-LEAGUE-ORIGINS", "H1-B5-GREAT-POWERS-VETO", DD),
    ("H1-B5-GREAT-POWERS-VETO", "H1-B5-UN-CHARTER", DD),
    ("H1-B5-UN-CHARTER", "H1-B5-UN-CASES-LIMITED", DD),
    ("H1-B5-UN-CASES-LIMITED", "H1-B5-UN-CASES-1990S", DD),
    # study 6 — the Cold War
    ("H1-6-RIVALRY-IDEOLOGY", "H1-6-EXPANSION-CONTAINMENT", DD),
    ("H1-6-EXPANSION-CONTAINMENT", "H1-6-KOREA-WP-COEXIST", DD),
    ("H1-6-KOREA-WP-COEXIST", "H1-6-U2-WALL", DD),
    ("H1-6-U2-WALL", "H1-6-THAW", DD),
    # B6 — the changing nature of warfare
    ("H1-B6-WWI-CHANGES", "H1-B6-BLITZKRIEG-BLITZ", UWR),
    ("H1-B6-BLITZKRIEG-BLITZ", "H1-B6-ATOMIC-NUCLEAR", DD),
    ("H1-B6-ATOMIC-NUCLEAR", "H1-B6-CONVENTIONAL-GULF", UWR),
    ("H1-B6-CONVENTIONAL-GULF", "H1-B6-HIGH-TECH", UWR),
    # study 7 — the USA: civil rights and protest
    ("H1-7-RED-SCARE", "H1-7-SEGREGATION", UWR),
    ("H1-7-SEGREGATION", "H1-7-CR-PROTESTS", DD),
    ("H1-7-CR-PROTESTS", "H1-7-STUDENT-MOVEMENT", DD),
    # B7 — the Middle East
    ("H1-B7-BALFOUR-MANDATE", "H1-B7-UN-PARTITION-1948", DD),
    ("H1-B7-UN-PARTITION-1948", "H1-B7-NASSER-1967", DD),
    ("H1-B7-NASSER-1967", "H1-B7-KISSINGER-CAMP-DAVID", DD),
    ("H1-B7-KISSINGER-CAMP-DAVID", "H1-B7-PEACE-PROCESS", DD),
    # study 8 — South Africa
    ("H1-8-1948-APARTHEID", "H1-8-PETTY-APARTHEID", DD),
    ("H1-8-PETTY-APARTHEID", "H1-8-RESISTANCE-MANDELA", DD),
    ("H1-8-RESISTANCE-MANDELA", "H1-8-OPPOSITION-UDF", DD),
    ("H1-8-OPPOSITION-UDF", "H1-8-DEKLERK-REFORMS", DD),
    # B8 — Britain: diversity, rights, equality
    ("H1-B8-1914-DIVERSITY", "H1-B8-DEPRESSION-WAR", DD),
    ("H1-B8-DEPRESSION-WAR", "H1-B8-WINDRUSH-IMMIGRANTS", DD),
    ("H1-B8-WINDRUSH-IMMIGRANTS", "H1-B8-FEMINISM-EQUALITY", UWR),
    ("H1-B8-FEMINISM-EQUALITY", "H1-B8-EQUAL-RIGHTS-DRIVE", DD),
    # honest cross-module bridges the specification itself names
    ("H1-A1-US-ENTRY-LUDENDORFF", "H1-3-ABDICATION-REPUBLIC", UWR),
    ("H1-A5-WALL-ORIGINS", "H1-6-U2-WALL", UWR),
    ("H1-A5-OSTPOLITIK", "H1-6-THAW", UWR),
    ("H1-6-THAW", "H1-B6-ATOMIC-NUCLEAR", UWR),
    ("H1-6-RIVALRY-IDEOLOGY", "H1-7-RED-SCARE", UWR),
    # knowingly served-order-reversed territory — dropped by the law,
    # counted and disclosed:
    ("H1-B1-EXPANSION", "H1-B1-TENSIONS-SLAVERY", UWR),
    ("H1-6-EXPANSION-CONTAINMENT", "H1-A4-GENEVA-DOMINO", UWR),
]

"""0478 IGCSE Computer Science concept lattice — T-KG-PRE-14
(F8 rollout batch twelve, the computer-science family tranche 9;
serves cie-igcse-computer-science-23, 88 served points).

AI_SUGGESTED / UNVALIDATED concept web authored by the F8 lane from the CIE
0478 IGCSE Computer Science syllabus (sections: 1 data representation, 2 data
transmission, 3 hardware, 4 software, 5 the internet and its uses, 6
automated and emerging technologies, 8 programming — the served spine maps
the algorithm-design-and-problem-solving register under 6.3.x), anchored to
the served spine's point ids. Every anchor is machine-verified against the
spine before any byte is written (0-unmapped pass law, enforced in
kg_f8ma_generate.py).

Structure of record: each section is a definitional chain (foundation
concept -> process -> evaluation -> application), with honest cross-section
bridges only where the syllabus itself names the dependency (binary ->
character sets and storage measurement; media representation -> file-size
calculation; packets -> error detection and encryption; sensors ->
automated systems; CPU components -> the logic-gate symbol register;
internet -> digital currency and cyber security; symmetric/asymmetric
encryption -> security solutions; validation -> test data -> trace tables ->
error identification -> algorithm writing). The served spine's examination-
format registers (6.3.1a flowchart symbols, 6.3.2a logic gate symbols,
6.3.3a pseudocode format) are treated as their own skills register in the
8021GP/0460 skills-register style of batches ten and eleven, hanging into
the algorithm register and the 8.x programming block. The advisory points
6.3.4/6.3.4a (programming practice guidance) are deliberately unanchored.
One authored pair is knowingly served-order-reversed (OS role -> virtual
memory: the served order places 3.3.4 before the 4.1.2 OS role that creates
it); the calibrated in-order law drops exactly that, counted and disclosed —
the law working as designed.

Honesty: prereqValidated stays EMPTY; the renderer labels every exported pair
INFERRED PROTOTYPE; the named gate remains the SME validation pass.
"""

DD = "DEFINITIONAL_DEPENDENCY"
UWR = "USED_WITHOUT_RETEACHING"

CONCEPTS = {
    # 1.1 binary systems
    "C47-CON-BINARY-WHY": ["1.1.1"],
    "C47-CON-NUMBER-SYSTEMS": ["1.1.2"],
    "C47-CON-HEX-USES": ["1.1.3"],
    "C47-CON-BINARY-ADD-OVERFLOW": ["1.1.4"],
    "C47-CON-BINARY-SHIFTS": ["1.1.5"],
    "C47-CON-TWOS-COMPLEMENT": ["1.1.6"],
    # 1.2 text, sound, images
    "C47-CON-CHARACTER-SETS": ["1.2.1"],
    "C47-CON-SOUND-REPRESENTATION": ["1.2.2"],
    "C47-CON-IMAGE-REPRESENTATION": ["1.2.3"],
    # 1.3 storage and compression
    "C47-CON-STORAGE-MEASUREMENT": ["1.3.1"],
    "C47-CON-FILE-SIZE-CALCULATION": ["1.3.2"],
    "C47-CON-COMPRESSION-PURPOSE": ["1.3.3"],
    "C47-CON-COMPRESSION-METHODS": ["1.3.4"],
    # 2.1 transmission
    "C47-CON-PACKETS": ["2.1.1"],
    "C47-CON-TRANSMISSION-METHODS": ["2.1.2"],
    "C47-CON-USB": ["2.1.3"],
    # 2.2 errors
    "C47-CON-ERROR-DETECTION-NEED": ["2.2.1"],
    "C47-CON-ERROR-METHODS": ["2.2.2"],
    "C47-CON-CHECK-DIGIT": ["2.2.3"],
    "C47-CON-ARQ": ["2.2.4"],
    # 2.3 encryption
    "C47-CON-ENCRYPTION-PURPOSE": ["2.3.1"],
    "C47-CON-SYM-ASYM-ENCRYPTION": ["2.3.2"],
    # 3.1 CPU
    "C47-CON-CPU-ROLE": ["3.1.1"],
    "C47-CON-CPU-COMPONENTS": ["3.1.2"],
    "C47-CON-CORE-CACHE-CLOCK": ["3.1.3"],
    "C47-CON-INSTRUCTION-SET": ["3.1.4"],
    "C47-CON-EMBEDDED-SYSTEMS": ["3.1.5"],
    # 3.2 devices
    "C47-CON-INPUT-DEVICES": ["3.2.1"],
    "C47-CON-OUTPUT-DEVICES": ["3.2.2"],
    "C47-CON-SENSORS": ["3.2.3"],
    # 3.3 storage
    "C47-CON-PRIMARY-STORAGE": ["3.3.1"],
    "C47-CON-SECONDARY-STORAGE": ["3.3.2"],
    "C47-CON-STORAGE-OPERATION": ["3.3.3"],
    "C47-CON-VIRTUAL-MEMORY": ["3.3.4"],
    "C47-CON-CLOUD-STORAGE": ["3.3.5"],
    "C47-CON-CLOUD-ADVANTAGES": ["3.3.6"],
    # 3.4 networking
    "C47-CON-NIC": ["3.4.1"],
    "C47-CON-MAC-ADDRESS": ["3.4.2"],
    "C47-CON-IP-ADDRESS": ["3.4.3"],
    "C47-CON-ROUTER-ROLE": ["3.4.4"],
    # 4.1 software
    "C47-CON-SYSTEM-VS-APPLICATION": ["4.1.1"],
    "C47-CON-OS-ROLE": ["4.1.2"],
    "C47-CON-HW-FW-OS-APPS": ["4.1.3"],
    "C47-CON-INTERRUPTS": ["4.1.4"],
    # 4.2 languages
    "C47-CON-HL-LL-LANGUAGES": ["4.2.1"],
    "C47-CON-ASSEMBLY-MNEMONICS": ["4.2.2"],
    "C47-CON-COMPILER-INTERPRETER-OPS": ["4.2.3"],
    "C47-CON-COMPILER-INTERPRETER-ADV": ["4.2.4"],
    "C47-CON-IDE-ROLE": ["4.2.5"],
    # 5.1 the internet
    "C47-CON-INTERNET-VS-WWW": ["5.1.1"],
    "C47-CON-URL": ["5.1.2"],
    "C47-CON-HTTP-HTTPS": ["5.1.3"],
    "C47-CON-WEB-BROWSER": ["5.1.4"],
    "C47-CON-WEB-PAGE-FETCH": ["5.1.5"],
    "C47-CON-COOKIES": ["5.1.6"],
    # 5.2 digital currency
    "C47-CON-DIGITAL-CURRENCY": ["5.2.1"],
    "C47-CON-BLOCKCHAIN": ["5.2.2"],
    # 5.3 cyber security
    "C47-CON-CYBER-THREATS": ["5.3.1"],
    "C47-CON-SECURITY-SOLUTIONS": ["5.3.2"],
    # 6.1 automated systems
    "C47-CON-AUTOMATED-SYSTEMS": ["6.1.1"],
    "C47-CON-AUTOMATED-ADVANTAGES": ["6.1.2"],
    # 6.2 robotics
    "C47-CON-ROBOTICS": ["6.2.1"],
    "C47-CON-ROBOT-CHARACTERISTICS": ["6.2.2"],
    "C47-CON-ROBOT-ROLES": ["6.2.3"],
    # 6.3 AI + examination-format registers
    "C47-CON-AI-DEFINITION": ["6.3.1"],
    "C47-CON-AI-CHARACTERISTICS": ["6.3.2"],
    "C47-CON-AI-OPERATION": ["6.3.3"],
    "C47-CON-VALIDATION-TYPES": ["6.3.5"],
    "C47-CON-TEST-DATA": ["6.3.6"],
    "C47-CON-TRACE-TABLE": ["6.3.7"],
    "C47-CON-ERROR-IDENTIFICATION": ["6.3.8"],
    "C47-CON-ALGORITHM-WRITE-AMEND": ["6.3.9"],
    "C47-CON-FLOWCHART-SYMBOLS": ["6.3.1a"],
    "C47-CON-LOGIC-GATE-SYMBOLS": ["6.3.2a"],
    "C47-CON-PSEUDOCODE-FORMAT": ["6.3.3a"],
    # 8.1 programming
    "C47-CON-VARIABLES-CONSTANTS": ["8.1.1"],
    "C47-CON-OPERATORS": ["8.1.1a"],
    "C47-CON-BASIC-DATA-TYPES": ["8.1.2"],
    "C47-CON-INPUT-OUTPUT": ["8.1.3"],
    "C47-CON-SEQUENCE-TOTALING": ["8.1.4"],
    "C47-CON-MAINTAINABLE-PROGRAM": ["8.1.8"],
    # 8.2 arrays
    "C47-CON-ARRAYS": ["8.2.1"],
    "C47-CON-ARRAY-USE": ["8.2.2"],
    "C47-CON-ARRAY-ITERATION": ["8.2.3"],
    # 8.3 files
    "C47-CON-FILE-PURPOSE": ["8.3.1"],
    "C47-CON-FILE-OPERATIONS": ["8.3.2"],
}

EDGES = [
    # 1.1 binary systems
    ("C47-CON-BINARY-WHY", "C47-CON-NUMBER-SYSTEMS", DD),
    ("C47-CON-NUMBER-SYSTEMS", "C47-CON-HEX-USES", DD),
    ("C47-CON-NUMBER-SYSTEMS", "C47-CON-BINARY-ADD-OVERFLOW", UWR),
    ("C47-CON-NUMBER-SYSTEMS", "C47-CON-BINARY-SHIFTS", UWR),
    ("C47-CON-NUMBER-SYSTEMS", "C47-CON-TWOS-COMPLEMENT", UWR),
    # 1.2 text, sound, images
    ("C47-CON-NUMBER-SYSTEMS", "C47-CON-CHARACTER-SETS", UWR),
    ("C47-CON-CHARACTER-SETS", "C47-CON-SOUND-REPRESENTATION", UWR),
    ("C47-CON-CHARACTER-SETS", "C47-CON-IMAGE-REPRESENTATION", UWR),
    # 1.3 storage and compression
    ("C47-CON-BINARY-WHY", "C47-CON-STORAGE-MEASUREMENT", UWR),
    ("C47-CON-STORAGE-MEASUREMENT", "C47-CON-FILE-SIZE-CALCULATION", DD),
    ("C47-CON-IMAGE-REPRESENTATION", "C47-CON-FILE-SIZE-CALCULATION", UWR),
    ("C47-CON-SOUND-REPRESENTATION", "C47-CON-FILE-SIZE-CALCULATION", UWR),
    ("C47-CON-STORAGE-MEASUREMENT", "C47-CON-COMPRESSION-PURPOSE", UWR),
    ("C47-CON-COMPRESSION-PURPOSE", "C47-CON-COMPRESSION-METHODS", DD),
    # 2.1 transmission
    ("C47-CON-BINARY-WHY", "C47-CON-PACKETS", UWR),
    ("C47-CON-PACKETS", "C47-CON-TRANSMISSION-METHODS", UWR),
    ("C47-CON-TRANSMISSION-METHODS", "C47-CON-USB", UWR),
    # 2.2 errors
    ("C47-CON-PACKETS", "C47-CON-ERROR-DETECTION-NEED", UWR),
    ("C47-CON-ERROR-DETECTION-NEED", "C47-CON-ERROR-METHODS", DD),
    ("C47-CON-ERROR-METHODS", "C47-CON-CHECK-DIGIT", UWR),
    ("C47-CON-ERROR-METHODS", "C47-CON-ARQ", UWR),
    # 2.3 encryption
    ("C47-CON-PACKETS", "C47-CON-ENCRYPTION-PURPOSE", UWR),
    ("C47-CON-ENCRYPTION-PURPOSE", "C47-CON-SYM-ASYM-ENCRYPTION", DD),
    # 3.1 CPU
    ("C47-CON-CPU-ROLE", "C47-CON-CPU-COMPONENTS", DD),
    ("C47-CON-CPU-COMPONENTS", "C47-CON-CORE-CACHE-CLOCK", UWR),
    ("C47-CON-CPU-COMPONENTS", "C47-CON-INSTRUCTION-SET", UWR),
    ("C47-CON-CPU-ROLE", "C47-CON-EMBEDDED-SYSTEMS", UWR),
    # 3.2 devices
    ("C47-CON-CPU-ROLE", "C47-CON-INPUT-DEVICES", UWR),
    ("C47-CON-CPU-ROLE", "C47-CON-OUTPUT-DEVICES", UWR),
    ("C47-CON-INPUT-DEVICES", "C47-CON-SENSORS", UWR),
    # 3.3 storage
    ("C47-CON-CPU-ROLE", "C47-CON-PRIMARY-STORAGE", UWR),
    ("C47-CON-PRIMARY-STORAGE", "C47-CON-SECONDARY-STORAGE", UWR),
    ("C47-CON-SECONDARY-STORAGE", "C47-CON-STORAGE-OPERATION", DD),
    ("C47-CON-PRIMARY-STORAGE", "C47-CON-VIRTUAL-MEMORY", UWR),
    ("C47-CON-SECONDARY-STORAGE", "C47-CON-VIRTUAL-MEMORY", UWR),
    ("C47-CON-SECONDARY-STORAGE", "C47-CON-CLOUD-STORAGE", UWR),
    ("C47-CON-CLOUD-STORAGE", "C47-CON-CLOUD-ADVANTAGES", DD),
    # 3.4 networking
    ("C47-CON-TRANSMISSION-METHODS", "C47-CON-NIC", UWR),
    ("C47-CON-NIC", "C47-CON-MAC-ADDRESS", DD),
    ("C47-CON-NIC", "C47-CON-IP-ADDRESS", UWR),
    ("C47-CON-MAC-ADDRESS", "C47-CON-IP-ADDRESS", UWR),
    ("C47-CON-IP-ADDRESS", "C47-CON-ROUTER-ROLE", UWR),
    # 4.1 software
    ("C47-CON-SYSTEM-VS-APPLICATION", "C47-CON-OS-ROLE", DD),
    ("C47-CON-SYSTEM-VS-APPLICATION", "C47-CON-HW-FW-OS-APPS", UWR),
    ("C47-CON-OS-ROLE", "C47-CON-HW-FW-OS-APPS", DD),
    ("C47-CON-CPU-COMPONENTS", "C47-CON-INTERRUPTS", UWR),
    # 4.2 languages
    ("C47-CON-SYSTEM-VS-APPLICATION", "C47-CON-HL-LL-LANGUAGES", UWR),
    ("C47-CON-HL-LL-LANGUAGES", "C47-CON-ASSEMBLY-MNEMONICS", DD),
    ("C47-CON-HL-LL-LANGUAGES", "C47-CON-COMPILER-INTERPRETER-OPS", UWR),
    ("C47-CON-COMPILER-INTERPRETER-OPS", "C47-CON-COMPILER-INTERPRETER-ADV", DD),
    ("C47-CON-COMPILER-INTERPRETER-ADV", "C47-CON-IDE-ROLE", UWR),
    # 5.1 the internet
    ("C47-CON-NIC", "C47-CON-INTERNET-VS-WWW", UWR),
    ("C47-CON-INTERNET-VS-WWW", "C47-CON-URL", DD),
    ("C47-CON-URL", "C47-CON-HTTP-HTTPS", UWR),
    ("C47-CON-INTERNET-VS-WWW", "C47-CON-WEB-BROWSER", UWR),
    ("C47-CON-URL", "C47-CON-WEB-PAGE-FETCH", UWR),
    ("C47-CON-HTTP-HTTPS", "C47-CON-WEB-PAGE-FETCH", UWR),
    ("C47-CON-WEB-BROWSER", "C47-CON-WEB-PAGE-FETCH", DD),
    ("C47-CON-WEB-PAGE-FETCH", "C47-CON-COOKIES", UWR),
    # 5.2 digital currency
    ("C47-CON-INTERNET-VS-WWW", "C47-CON-DIGITAL-CURRENCY", UWR),
    ("C47-CON-DIGITAL-CURRENCY", "C47-CON-BLOCKCHAIN", DD),
    # 5.3 cyber security
    ("C47-CON-INTERNET-VS-WWW", "C47-CON-CYBER-THREATS", UWR),
    ("C47-CON-CYBER-THREATS", "C47-CON-SECURITY-SOLUTIONS", UWR),
    ("C47-CON-SYM-ASYM-ENCRYPTION", "C47-CON-SECURITY-SOLUTIONS", UWR),
    # 6.1 automated systems
    ("C47-CON-SENSORS", "C47-CON-AUTOMATED-SYSTEMS", DD),
    ("C47-CON-AUTOMATED-SYSTEMS", "C47-CON-AUTOMATED-ADVANTAGES", DD),
    # 6.2 robotics
    ("C47-CON-AUTOMATED-SYSTEMS", "C47-CON-ROBOTICS", UWR),
    ("C47-CON-ROBOTICS", "C47-CON-ROBOT-CHARACTERISTICS", DD),
    ("C47-CON-ROBOT-CHARACTERISTICS", "C47-CON-ROBOT-ROLES", UWR),
    # 6.3 AI
    ("C47-CON-AUTOMATED-SYSTEMS", "C47-CON-AI-DEFINITION", UWR),
    ("C47-CON-AI-DEFINITION", "C47-CON-AI-CHARACTERISTICS", DD),
    ("C47-CON-AI-CHARACTERISTICS", "C47-CON-AI-OPERATION", DD),
    # 6.3 algorithm register
    ("C47-CON-ERROR-DETECTION-NEED", "C47-CON-VALIDATION-TYPES", UWR),
    ("C47-CON-VALIDATION-TYPES", "C47-CON-TEST-DATA", UWR),
    ("C47-CON-TEST-DATA", "C47-CON-TRACE-TABLE", UWR),
    ("C47-CON-TRACE-TABLE", "C47-CON-ERROR-IDENTIFICATION", UWR),
    ("C47-CON-ERROR-IDENTIFICATION", "C47-CON-ALGORITHM-WRITE-AMEND", UWR),
    # examination-format registers (the 6.3.a block)
    ("C47-CON-FLOWCHART-SYMBOLS", "C47-CON-PSEUDOCODE-FORMAT", UWR),
    ("C47-CON-CPU-COMPONENTS", "C47-CON-LOGIC-GATE-SYMBOLS", UWR),
    ("C47-CON-FLOWCHART-SYMBOLS", "C47-CON-TRACE-TABLE", UWR),
    ("C47-CON-PSEUDOCODE-FORMAT", "C47-CON-TRACE-TABLE", UWR),
    ("C47-CON-PSEUDOCODE-FORMAT", "C47-CON-ALGORITHM-WRITE-AMEND", UWR),
    # 8.1 programming
    ("C47-CON-PSEUDOCODE-FORMAT", "C47-CON-VARIABLES-CONSTANTS", UWR),
    ("C47-CON-VARIABLES-CONSTANTS", "C47-CON-OPERATORS", UWR),
    ("C47-CON-VARIABLES-CONSTANTS", "C47-CON-BASIC-DATA-TYPES", UWR),
    ("C47-CON-BASIC-DATA-TYPES", "C47-CON-INPUT-OUTPUT", UWR),
    ("C47-CON-INPUT-OUTPUT", "C47-CON-SEQUENCE-TOTALING", UWR),
    ("C47-CON-SEQUENCE-TOTALING", "C47-CON-MAINTAINABLE-PROGRAM", UWR),
    ("C47-CON-VALIDATION-TYPES", "C47-CON-MAINTAINABLE-PROGRAM", UWR),
    # 8.2 arrays
    ("C47-CON-SEQUENCE-TOTALING", "C47-CON-ARRAYS", UWR),
    ("C47-CON-ARRAYS", "C47-CON-ARRAY-USE", DD),
    ("C47-CON-ARRAY-USE", "C47-CON-ARRAY-ITERATION", DD),
    # 8.3 files
    ("C47-CON-SEQUENCE-TOTALING", "C47-CON-FILE-PURPOSE", UWR),
    ("C47-CON-FILE-PURPOSE", "C47-CON-FILE-OPERATIONS", DD),
    # knowingly served-order-reversed authored pair (honest teaching
    # direction; the in-order law drops it, counted and disclosed):
    # the OS role -> virtual memory (the served order places 3.3.4 virtual
    # memory before the 4.1.2 OS role whose memory management creates it)
    ("C47-CON-OS-ROLE", "C47-CON-VIRTUAL-MEMORY", UWR),
]

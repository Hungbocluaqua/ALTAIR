"""
rePhase Project (.rephase XML) Exporter.
Generates valid XML project files ready to open directly in rePhase for manual inspection & FIR generation.
"""

from typing import Dict, Optional, List
import xml.etree.ElementTree as ET


def export_rephase_xml(
    sample_rate: int = 48000,
    taps: int = 65536,
    crossover_freq: float = 2500.0,
    crossover_order: int = 4,
    preamp_db: float = -4.0,
    modal_freqs: Optional[List[float]] = None,
) -> str:
    """
    Generate valid .rephase XML project file.
    """
    root = ET.Element("rephase", version="1.4.3")
    
    # Global settings
    settings = ET.SubElement(root, "settings")
    ET.SubElement(settings, "sample_rate").text = str(sample_rate)
    ET.SubElement(settings, "taps").text = str(taps)
    ET.SubElement(settings, "window").text = "tukey"
    ET.SubElement(settings, "centering").text = "middle"
    ET.SubElement(settings, "format").text = "float 32bit (.wav)"
    
    # Gain / Preamp
    gain = ET.SubElement(root, "gain")
    ET.SubElement(gain, "preamp").text = f"{preamp_db:.2f}"
    
    # Linearization bank
    crossovers = ET.SubElement(root, "crossovers")
    xo = ET.SubElement(crossovers, "crossover", active="true")
    ET.SubElement(xo, "type").text = f"Linkwitz-Riley {crossover_order * 6}dB/oct"
    ET.SubElement(xo, "freq").text = f"{crossover_freq:.1f}"
    ET.SubElement(xo, "kind").text = "high-pass"
    
    # Modal EQ banks
    eq_bank = ET.SubElement(root, "eq_bank")
    if modal_freqs:
        for i, f_m in enumerate(modal_freqs, 1):
            eq = ET.SubElement(eq_bank, "filter", active="true")
            ET.SubElement(eq, "type").text = "peak"
            ET.SubElement(eq, "freq").text = f"{f_m:.1f}"
            ET.SubElement(eq, "gain").text = "-3.0"
            ET.SubElement(eq, "q").text = "3.0"
            
    # Pretty print XML
    import xml.dom.minidom
    xml_str = ET.tostring(root, encoding="utf-8")
    parsed = xml.dom.minidom.parseString(xml_str)
    return parsed.toprettyxml(indent="  ")

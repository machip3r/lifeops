import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const base64Data = `data:application/pdf;base64,${base64}`;

    // Call Mistral AI OCR API
    const mistralApiKey = process.env.MISTRAL_API_KEY;
    if (!mistralApiKey) {
      return NextResponse.json(
        { error: 'Mistral API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: base64Data,
        },
        table_format: 'html',
        extract_header: true,
        extract_footer: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Mistral API error: ${error}` },
        { status: response.status }
      );
    }

    const ocrResult = await response.json();

    // Extract text, markdown, and tables from all pages
    let fullText = '';
    if (ocrResult.pages && Array.isArray(ocrResult.pages)) {
      const pageTexts = ocrResult.pages.map((page: any) => {
        const parts: string[] = [];
        
        // Add markdown text
        if (page.markdown) {
          parts.push(page.markdown);
        }
        
        // Add plain text
        if (page.text) {
          parts.push(page.text);
        }
        
        // Add table HTML content
        if (page.tables && Array.isArray(page.tables)) {
          page.tables.forEach((table: any, index: number) => {
            if (table.html) {
              parts.push(`\n--- TABLA ${index + 1} ---\n${table.html}\n`);
            } else if (table.markdown) {
              parts.push(`\n--- TABLA ${index + 1} ---\n${table.markdown}\n`);
            }
          });
        }
        
        return parts.join('\n\n');
      });
      
      fullText = pageTexts.join('\n\n--- PÁGINA SIGUIENTE ---\n\n');
    }

    // Second call: Use completions API to extract structured data
    const completionResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente experto en extraer datos estructurados de documentos de seguros de vida mexicanos.

Tu tarea es analizar el documento completo, incluyendo todas las tablas HTML, texto y markdown, y extraer la siguiente información en formato JSON válido:

{
  "prospectName": "nombre completo del prospecto/cliente (busca en encabezados, tablas o texto principal)",
  "projectName": "nombre del proyecto o plan (busca códigos como ORVI, números de plan, ej: ORVI 99 10-15)",
  "age": número de edad del asegurado (solo el número, sin texto),
  "insuredAmount": suma asegurada como número sin comas ni símbolos (busca en tablas de proyección o resumen),
  "basicPremium": prima básica o aportación anual como número sin comas ni símbolos (busca en tablas de proyección),
  "paymentTerm": plazo de pagos en años (debe ser 5, 10, 15 o 20, busca en tablas o texto que mencione años de pago),
  "currency": "UDIS" o "Dolares" (determina por el contexto: si menciona UDI/UDIS usa "UDIS", si menciona dólares usa "Dolares"),
  "currentUDIValue": valor actual UDI o tipo de cambio dólar como número decimal (busca valores como 8.56, puede estar en tablas o texto),
  "projectedDevaluation": inflación o devaluación proyectada como número decimal sin % (busca tasas como 3.00%, 4.00% en notas o tablas),
  "effectiveValueYear14": valor efectivo año 14 como número sin comas (busca en tablas de valores garantizados, fila año 14),
  "effectiveValueYear19": valor efectivo año 19 como número sin comas (busca en tablas de valores garantizados, fila año 19),
  "effectiveValueYear24": valor efectivo año 24 como número sin comas (busca en tablas de valores garantizados, fila año 24),
  "advisor": "nombre completo del asesor (busca después de "Asesor profesional", "Nombre:", o en encabezados)"
}

INSTRUCCIONES CRÍTICAS:
1. ANALIZA TODAS LAS TABLAS HTML: Las tablas contienen la mayoría de los datos. Busca en las tablas:
   - Proyecciones anuales (años, edades, aportaciones, protecciones)
   - Valores garantizados (años 14, 19, 24)
   - Resúmenes o totales
2. BUSCA EN EL TEXTO: Algunos datos pueden estar en texto plano o markdown
3. PATRONES COMUNES:
   - Edad: busca números seguidos de "años" o en tablas de proyección (columna "Edad")
   - Suma asegurada: busca en tablas de proyección (columna "Protección" o similar)
   - Prima básica: busca en tablas de proyección (columna "Aportación" o "Prima")
   - Plazo de pagos: cuenta cuántos años tienen aportaciones en la tabla de proyección, o busca texto como "10-15" (15 años)
   - Valores efectivos: busca en tablas de "VALORES GARANTIZADOS" o similar, filas correspondientes a años 14, 19, 24
4. FORMATO DE NÚMEROS:
   - Elimina todas las comas de los números
   - Elimina símbolos de moneda ($, USD, MXN, etc.)
   - Usa números puros: 145000 (no 145,000 o $145,000)
   - Para decimales: 8.56 (no 8,56)
5. VALORES ESPECIALES:
   - currency: Si el documento menciona "UDI" o "UDIS" o "Unidades de Inversión", usa "UDIS". Si menciona "dólares" o "dollars", usa "Dolares"
   - paymentTerm: Si encuentras "10-15" en el nombre del proyecto, significa 15 años. Cuenta los años con aportaciones en la tabla.
   - projectedDevaluation: Si dice "tasa de inversión supuesta del 3.00%", usa 3.0 (sin el %)
6. Si un campo NO se encuentra después de analizar TODO el documento (texto, tablas, markdown), usa null para ese campo
7. Devuelve SOLO el JSON válido, sin texto adicional, sin markdown, sin explicaciones, sin código de bloque`,
          },
          {
            role: 'user',
            content: `Extrae los datos del siguiente documento de seguro. Incluye texto, markdown y tablas HTML:\n\n${fullText.substring(0, 50000)}`, // Increased limit to include table HTML
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!completionResponse.ok) {
      const error = await completionResponse.text();
      console.error('Mistral Completions API error:', error);
      // Fallback to regex parsing if completions fails
      const extractedData = parseProjectionData(fullText);
      return NextResponse.json({
        success: true,
        extractedData,
        rawText: fullText,
        warning: 'Completions API failed, used fallback parsing',
      });
    }

    const completionResult = await completionResponse.json();
    const extractedDataText = completionResult.choices?.[0]?.message?.content || '{}';

    let extractedData: Partial<FormData> = {};
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanedText = extractedDataText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      extractedData = JSON.parse(cleanedText);
      
      // Validate and clean the extracted data
      if (extractedData.projectedDevaluation && typeof extractedData.projectedDevaluation === 'string') {
        extractedData.projectedDevaluation = parseFloat(extractedData.projectedDevaluation.replace('%', '').trim()) || null;
      }
    } catch (parseError) {
      console.error('Failed to parse JSON from completions:', parseError);
      console.error('Raw response:', extractedDataText);
      // Fallback to regex parsing
      extractedData = parseProjectionData(fullText);
    }

    return NextResponse.json({
      success: true,
      extractedData,
      rawText: fullText,
    });
  } catch (error: any) {
    console.error('OCR extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process PDF' },
      { status: 500 }
    );
  }
}

function parseProjectionData(text: string): Partial<FormData> {
  const data: Partial<FormData> = {};

  // Extract data from HTML tables if present
  const tableMatches = text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  const tableTexts: string[] = [];
  for (const match of tableMatches) {
    // Extract text content from table (remove HTML tags)
    const tableText = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    tableTexts.push(tableText);
  }
  const allTableText = tableTexts.join(' ');

  // Extract prospect name (look for patterns like "Nombre del Prospecto", "Prospecto:", etc.)
  // Try multiple patterns
  const prospectPatterns = [
    /(?:prospecto|nombre\s+del\s+prospecto)[\s:]+([A-ZÁÉÍÓÚÑ\s]+)/i,
    /prospecto[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i,
    /nombre[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i,
  ];
  
  // Search in both main text and table text
  const searchText = text + ' ' + allTableText;

  for (const pattern of prospectPatterns) {
    const match = searchText.match(pattern);
    if (match && match[1]) {
      data.prospectName = match[1].trim();
      break;
    }
  }

  // Extract project name (look for patterns like "ORVI", project codes)
  const projectPatterns = [
    /(ORVI\s*\d+[\s-]+\d+[\s-]+\d+)/i,
    /(ORVI\s+\d+)/i,
    /(proyecto|project)[\s:]+([A-Z0-9\s-]+)/i,
  ];

  for (const pattern of projectPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.projectName = (match[1] || match[2] || match[0]).trim();
      break;
    }
  }

  // Extract age - also try to find in first row of projection table
  const agePatterns = [
    /(?:edad|age)[\s:]*(\d{1,3})/i,
    /(\d{1,3})\s*(?:años|years?|edad)/i,
  ];

  for (const pattern of agePatterns) {
    const match = searchText.match(pattern);
    if (match) {
      const age = parseInt(match[1], 10);
      if (age >= 1 && age <= 120) {
        data.age = age;
        break;
      }
    }
  }
  
  // Try to extract age from table (first row, age column)
  if (!data.age && allTableText) {
    const ageInTable = allTableText.match(/\b(\d{1,2})\s+(?:año|edad)/i);
    if (ageInTable) {
      const age = parseInt(ageInTable[1], 10);
      if (age >= 1 && age <= 120) {
        data.age = age;
      }
    }
  }

  // Extract insured amount (Suma Asegurada) - look in tables for protection values
  const insuredPatterns = [
    /(?:suma\s+asegurada|insured\s+amount|protección)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /suma\s+asegurada[\s:]*([\d,]+)/i,
  ];

  for (const pattern of insuredPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.insuredAmount = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract basic premium (Prima Básica) - look in tables for contribution values
  const premiumPatterns = [
    /(?:prima\s+básica|basic\s+premium|aportación)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /prima\s+básica[\s:]*([\d,]+)/i,
  ];

  for (const pattern of premiumPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.basicPremium = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract payment term (Plazo de Pagos) - count years with contributions in table
  const termPatterns = [
    /(?:plazo\s+de\s+pagos|payment\s+term)[\s:]*(\d+)/i,
    /(?:pago|payment)[\s:]*(\d+)\s*(?:años|years?)/i,
    /(\d+)[\s-]+(\d+)/, // Pattern like "10-15" means 15 years
  ];

  for (const pattern of termPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      if (match[2]) {
        // Pattern like "10-15"
        const term = parseInt(match[2], 10);
        if ([5, 10, 15, 20].includes(term)) {
          data.paymentTerm = term;
          break;
        }
      } else {
        const term = parseInt(match[1], 10);
        if ([5, 10, 15, 20].includes(term)) {
          data.paymentTerm = term;
          break;
        }
      }
    }
  }

  // Extract currency (Moneda)
  if (searchText.match(/UDIS|UDI|Unidades\s+de\s+Inversión/i) && !searchText.match(/dolares?|dollar/i)) {
    data.currency = 'UDIS';
  } else if (searchText.match(/dolares?|dollar/i)) {
    data.currency = 'Dolares';
  }

  // Extract current UDI value
  const udiPatterns = [
    /(?:valor\s+actual\s+udi|current\s+udi\s+value|udi\s+actual|tipo\s+de\s+cambio)[\s:]*(\d+\.?\d*)/i,
    /udi[\s:]*(\d+\.?\d*)/i,
  ];

  for (const pattern of udiPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.currentUDIValue = parseFloat(match[1]);
      break;
    }
  }

  // Extract inflation/devaluation - look for "tasa de inversión supuesta"
  const inflationPatterns = [
    /(?:tasa\s+de\s+inversión\s+supuesta|inflación|inflation|devaluación|devaluation)[\s:]*del?\s*(\d+\.?\d*)\s*%/i,
    /(?:inflación|devaluación)[\s:]*(\d+\.?\d*)\s*%/i,
    /(?:inflación|devaluación)[\s:]*(\d+\.?\d*)/i,
  ];

  for (const pattern of inflationPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.projectedDevaluation = parseFloat(match[1]);
      break;
    }
  }

  // Extract effective values - look in "VALORES GARANTIZADOS" tables
  const effective14Patterns = [
    /(?:valor\s+efectivo\s+año\s+14|effective\s+value\s+year\s+14|año\s+14)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /año\s+14[\s:]*([\d,]+)/i,
    /14[\s,]+(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/, // Year 14 in table row
  ];

  for (const pattern of effective14Patterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.effectiveValueYear14 = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  const effective19Patterns = [
    /(?:valor\s+efectivo\s+año\s+19|effective\s+value\s+year\s+19|año\s+19)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /año\s+19[\s:]*([\d,]+)/i,
    /19[\s,]+(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/, // Year 19 in table row
  ];

  for (const pattern of effective19Patterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.effectiveValueYear19 = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  const effective24Patterns = [
    /(?:valor\s+efectivo\s+año\s+24|effective\s+value\s+year\s+24|año\s+24)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /año\s+24[\s:]*([\d,]+)/i,
    /24[\s,]+(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/, // Year 24 in table row
  ];

  for (const pattern of effective24Patterns) {
    const match = searchText.match(pattern);
    if (match) {
      data.effectiveValueYear24 = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract advisor name
  const advisorPatterns = [
    /(?:asesor\s+profesional|asesor|advisor|consultant)[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i,
    /nombre[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i, // After "Asesor profesional de seguros"
  ];

  for (const pattern of advisorPatterns) {
    const match = searchText.match(pattern);
    if (match && match[1]) {
      data.advisor = match[1].trim();
      break;
    }
  }

  return data;
}

interface FormData {
  prospectName?: string;
  projectName?: string;
  age?: number;
  insuredAmount?: number;
  basicPremium?: number;
  paymentTerm?: number;
  currency?: 'UDIS' | 'Dolares';
  effectiveValueYear14?: number;
  effectiveValueYear19?: number;
  effectiveValueYear24?: number;
  currentUDIValue?: number;
  projectedDevaluation?: number;
  advisor?: string;
}

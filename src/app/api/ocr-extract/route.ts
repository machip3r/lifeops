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
          type: 'document_base64',
          document_base64: base64Data,
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

    // Extract text from all pages
    let fullText = '';
    if (ocrResult.pages && Array.isArray(ocrResult.pages)) {
      fullText = ocrResult.pages
        .map((page: any) => page.markdown || '')
        .join('\n\n');
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
            content: `Eres un asistente experto en extraer datos estructurados de documentos de seguros de vida.

Analiza el texto del documento y extrae la siguiente información en formato JSON válido:

{
  "prospectName": "nombre completo del prospecto/cliente",
  "projectName": "nombre del proyecto (ej: ORVI 99 10-15)",
  "age": número de edad (solo el número),
  "insuredAmount": suma asegurada como número sin comas ni símbolos,
  "basicPremium": prima básica como número sin comas ni símbolos,
  "paymentTerm": plazo de pagos en años (debe ser 5, 10, 15 o 20),
  "currency": "UDIS" o "Dolares" (exactamente uno de estos dos valores),
  "currentUDIValue": valor actual UDI o dólar como número decimal,
  "projectedDevaluation": inflación o devaluación proyectada como número decimal (sin el símbolo %),
  "effectiveValueYear14": valor efectivo año 14 como número sin comas,
  "effectiveValueYear19": valor efectivo año 19 como número sin comas,
  "effectiveValueYear24": valor efectivo año 24 como número sin comas,
  "advisor": "nombre completo del asesor"
}

INSTRUCCIONES:
- Si un campo no se encuentra en el documento, usa null para ese campo
- Los números deben ser números puros, sin comas, sin símbolos de moneda
- Para currency, solo acepta "UDIS" o "Dolares"
- Para paymentTerm, solo acepta 5, 10, 15 o 20
- Devuelve SOLO el JSON válido, sin texto adicional, sin markdown, sin explicaciones`,
          },
          {
            role: 'user',
            content: `Extrae los datos del siguiente texto de un documento de seguro:\n\n${fullText.substring(0, 10000)}`, // Limit text to avoid token limits
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
      extractedData = JSON.parse(extractedDataText);
    } catch (parseError) {
      console.error('Failed to parse JSON from completions:', parseError);
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

  // Extract prospect name (look for patterns like "Nombre del Prospecto", "Prospecto:", etc.)
  // Try multiple patterns
  const prospectPatterns = [
    /(?:prospecto|nombre\s+del\s+prospecto)[\s:]+([A-ZÁÉÍÓÚÑ\s]+)/i,
    /prospecto[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i,
    /nombre[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i,
  ];
  
  for (const pattern of prospectPatterns) {
    const match = text.match(pattern);
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
    const match = text.match(pattern);
    if (match) {
      data.projectName = (match[1] || match[2] || match[0]).trim();
      break;
    }
  }

  // Extract age
  const agePatterns = [
    /(?:edad|age)[\s:]*(\d{1,3})/i,
    /(\d{1,3})\s*(?:años|years?|edad)/i,
  ];
  
  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match) {
      const age = parseInt(match[1], 10);
      if (age >= 1 && age <= 120) {
        data.age = age;
        break;
      }
    }
  }

  // Extract insured amount (Suma Asegurada)
  const insuredPatterns = [
    /(?:suma\s+asegurada|insured\s+amount)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /suma\s+asegurada[\s:]*([\d,]+)/i,
  ];
  
  for (const pattern of insuredPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.insuredAmount = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract basic premium (Prima Básica)
  const premiumPatterns = [
    /(?:prima\s+básica|basic\s+premium)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /prima\s+básica[\s:]*([\d,]+)/i,
  ];
  
  for (const pattern of premiumPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.basicPremium = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract payment term (Plazo de Pagos)
  const termPatterns = [
    /(?:plazo\s+de\s+pagos|payment\s+term)[\s:]*(\d+)/i,
    /(?:pago|payment)[\s:]*(\d+)\s*(?:años|years?)/i,
  ];
  
  for (const pattern of termPatterns) {
    const match = text.match(pattern);
    if (match) {
      const term = parseInt(match[1], 10);
      if ([5, 10, 15, 20].includes(term)) {
        data.paymentTerm = term;
        break;
      }
    }
  }

  // Extract currency (Moneda)
  if (text.match(/UDIS|UDI/i) && !text.match(/dolares?|dollar/i)) {
    data.currency = 'UDIS';
  } else if (text.match(/dolares?|dollar/i)) {
    data.currency = 'Dolares';
  }

  // Extract current UDI value
  const udiPatterns = [
    /(?:valor\s+actual\s+udi|current\s+udi\s+value|udi\s+actual)[\s:]*(\d+\.?\d*)/i,
    /udi[\s:]*(\d+\.?\d*)/i,
  ];
  
  for (const pattern of udiPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.currentUDIValue = parseFloat(match[1]);
      break;
    }
  }

  // Extract inflation/devaluation
  const inflationPatterns = [
    /(?:inflación|inflation|devaluación|devaluation)[\s:]*(\d+\.?\d*)\s*%/i,
    /(?:inflación|devaluación)[\s:]*(\d+\.?\d*)/i,
  ];
  
  for (const pattern of inflationPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.projectedDevaluation = parseFloat(match[1]);
      break;
    }
  }

  // Extract effective values
  const effective14Patterns = [
    /(?:valor\s+efectivo\s+año\s+14|effective\s+value\s+year\s+14|año\s+14)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /año\s+14[\s:]*([\d,]+)/i,
  ];
  
  for (const pattern of effective14Patterns) {
    const match = text.match(pattern);
    if (match) {
      data.effectiveValueYear14 = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  const effective19Patterns = [
    /(?:valor\s+efectivo\s+año\s+19|effective\s+value\s+year\s+19|año\s+19)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /año\s+19[\s:]*([\d,]+)/i,
  ];
  
  for (const pattern of effective19Patterns) {
    const match = text.match(pattern);
    if (match) {
      data.effectiveValueYear19 = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  const effective24Patterns = [
    /(?:valor\s+efectivo\s+año\s+24|effective\s+value\s+year\s+24|año\s+24)[\s:]*\$?[\s,]*(\d{1,3}(?:[,\d]{3})*(?:\.\d{2})?)/i,
    /año\s+24[\s:]*([\d,]+)/i,
  ];
  
  for (const pattern of effective24Patterns) {
    const match = text.match(pattern);
    if (match) {
      data.effectiveValueYear24 = parseFloat(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Extract advisor name
  const advisorPatterns = [
    /(?:asesor|advisor|consultant)[\s:]+([A-ZÁÉÍÓÚÑ\s]{2,})/i,
    /asesor[\s:]+([A-ZÁÉÍÓÚÑ\s]+)/i,
  ];
  
  for (const pattern of advisorPatterns) {
    const match = text.match(pattern);
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

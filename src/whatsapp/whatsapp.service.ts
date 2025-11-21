import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { SendAssistanceDto } from './dto/send-assistance.dto';

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private readonly logger: Logger;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isConnecting = false;
  private messageQueue: { phoneNumber: string; message: string }[] = [];
  private isProcessingQueue = false;

  // Selectores centralizados
  private readonly SELECTORS = {
    SEARCH_BOX: 'div[contenteditable="true"][data-tab="3"]',
    MESSAGE_BOX: 'div[contenteditable="true"][data-tab="10"]',
  };

  constructor(
    private configService: ConfigService,
    private accountId: string,
    private accountDescription: string,
  ) {
    this.logger = new Logger(`${WhatsappService.name} [${this.accountId}]`);
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.logger.log('🔌 Desconectado del navegador.');
    }
  }

  async initialize(port: number, browserHost: string): Promise<void> {
    if (this.isConnecting) {
      this.logger.log('Ya hay una conexión en progreso. Esperando...');
      return;
    }
    this.isConnecting = true;

    this.logger.log(`🎬 Intentando conectar con ${browserHost} en el puerto ${port}...`);

    let browserWSEndpoint: string;
    try {
      // Usamos el host y puerto proporcionados
      const response = await fetch(`http://${browserHost}:${port}/json/version`);
      if (!response.ok) {
        throw new Error(`No se pudo conectar al puerto de depuración. Estado: ${response.status}`);
      }
      const data = await response.json();
      browserWSEndpoint = data.webSocketDebuggerUrl;
    } catch (error) {
      this.logger.error(`❌ No se pudo conectar a ${browserHost} en el puerto ${port}.`);
      this.logger.error(`   Asegúrate de que el navegador esté abierto con --remote-debugging-port=${port} y --remote-debugging-address=0.0.0.0`);
      this.isConnecting = false;
      return;
    }

    try {
      this.browser = await puppeteer.connect({ browserWSEndpoint });
      this.logger.log(`✅ Conectado al navegador en ${browserHost}:${port}.`);

      // --- INICIO: Lógica mejorada para identificar la cuenta y cargar WhatsApp ---
      // 1. Abrir una página de bienvenida para identificar la ventana del navegador.
      const welcomePage = await this.browser.newPage();
      await welcomePage.setContent(`
        <html style="background-color: #2c3e50; color: #ecf0f1; display: flex; justify-content: center; align-items: center; height: 100%; font-family: sans-serif; text-align: center;">
          <head><title>${this.accountDescription}</title></head>
          <body><h1>Conectado a:<br/>${this.accountDescription}</h1></body>
        </html>
      `);

      // 2. Buscar una página de WhatsApp existente o crear una nueva.
      const pages = await this.browser.pages();
      const whatsappUrl = this.configService.get<string>('WHATSAPP_URL', 'https://web.whatsapp.com/');
      this.page = pages.find(p => p.url().startsWith(whatsappUrl)) || await this.browser.newPage();

      if (!this.page.url().startsWith(whatsappUrl)) {
        this.logger.log(`No se encontró página de WhatsApp. Navegando a ${whatsappUrl}...`);
        await this.page.goto(whatsappUrl, { waitUntil: 'networkidle2' });
      }
      // --- FIN: Lógica mejorada ---

      // Ajustar el tamaño de la ventana (viewport)
      const width = +this.configService.get<string>('WHATSAPP_VIEWPORT_WIDTH', '1280');
      const height = +this.configService.get<string>('WHATSAPP_VIEWPORT_HEIGHT', '800');
      if (this.page) {
        await this.page.setViewport({ width, height });
        this.logger.log(`📐 Viewport ajustado a ${width}x${height}.`);
      }

      this.logger.log('🔍 Verificando sesión de WhatsApp...');
      try {
        await this.page.waitForSelector(this.SELECTORS.SEARCH_BOX, { timeout: 10000 });
        this.logger.log('✅ Sesión de WhatsApp activa y lista.');
      } catch (error) {
        this.logger.warn('⚠️ Sesión no detectada. Por favor, escanea el código QR en la ventana del navegador.');
        this.logger.warn('   El servicio esperará 60 segundos para la sesión...');
        try {
          await this.page.waitForSelector(this.SELECTORS.SEARCH_BOX, { timeout: 60000 });
          this.logger.log('✅ Sesión iniciada correctamente.');
        } catch (e) {
          this.logger.error('❌ Tiempo de espera agotado. La sesión no se pudo verificar.');
          // Considerar cerrar el navegador o reintentar
        }
      }
    } catch (error) {
      this.logger.error('❌ Fallo crítico al conectar o preparar la página de WhatsApp.', error);
    } finally {
      this.isConnecting = false;
    }
  }

  private generateAssistanceMessage(reportData: SendAssistanceDto): string {
    const { student, time_assistance, type_assistance } = reportData;

    const formatDate = (date: Date): string => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    const abbreviateName = (fullName: string): string => {
      // Filtra para eliminar espacios en blanco accidentales y obtener un array limpio de partes del nombre.
      const parts = fullName.trim().split(/\s+/).filter(p => p);
      if (parts.length === 0) {
        return ''; // Si el nombre está vacío, devuelve una cadena vacía.
      }

      // Asume que el primer elemento es el primer nombre y el penúltimo es el apellido paterno.
      const firstName = parts[0];
      const firstSurname = parts.length > 1 ? parts[parts.length - 2] : '';
      const secondSurname = parts.length > 1 ? parts[parts.length - 1] : '';

      // Construye el nombre abreviado de forma segura.
      return `${firstName.toUpperCase()} ${firstSurname.toUpperCase()} ${secondSurname ? secondSurname.charAt(0).toUpperCase() + '.' : ''}`.trim();
    };

    const formatTime = (time: string): string => time.substring(0, 5);
    const registro = type_assistance === 'entrance' ? 'ENTRADA' : 'SALIDA';
    const formattedDate = formatDate(new Date());
    const formattedTime = formatTime(time_assistance);
    const abbreviatedName = abbreviateName(student);

    const initialEmoji = '🚨';
    const header = `${initialEmoji}🇨​​​​​🇴​​​​​🇱​​​​​🇪✅ [${formattedDate}]`;
    const separator = '➖➖➖➖➖➖➖➖➖➖';
    const studentLine = `🎓 *Estudiante:* ▫️ ${abbreviatedName}`;
    const timeLine = `⏰ *${registro}:* ▫️${formattedTime}`;
    const footer = '✨ ¡Gracias por su apoyo! 🙂 ✨';

    return `${header}\n${separator}\n${studentLine}\n${timeLine}\n${separator}\n${footer}`;
  }

  // TODO: Considerar crear un DTO para el body para mayor seguridad de tipos.
  private generateClassAttendanceReportMessage(body: any): string {
    const { colegio, nivel, reporte } = body;
    // Usar toLocaleDateString puede ser dependiente de la zona horaria del servidor.
    // Si se necesita un formato consistente, se podría usar la función formatDate existente.
    const today = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Íconos y colores fijos por grado
    // SUGERENCIA: Usar mapas para una asignación más precisa por nombre de grado
    const gradoIconMap: { [key: string]: string } = {
      "Cero": "0️⃣",
      "Primero": "1️⃣",
      "Segundo": "2️⃣",
      "Tercero": "3️⃣",
      "Cuarto": "4️⃣",
      "Quinto": "5️⃣",
      "Sexto": "6️⃣",
    };
    const gradoColorMap: { [key: string]: string } = {
      "Cero": "⚪", "Primero": "🟡", "Segundo": "🟢", "Tercero": "🔵",
      "Cuarto": "🟠", "Quinto": "🔴", "Sexto": "🟣",
    };

    let message = `🚨🇨​​​​​🇴​​​​​🇱​​​​​🇪✅ *[${today}]* 🚨\n\n`;
    message += `📝 *Reporte Preliminar de Asistencia*\n`;
    message += `⏰ *Hasta las 8:15 a.m.*\n\n`;
    message += `🏫 *${colegio}*\n`;
    message += `📚 *Nivel:* ${nivel.charAt(0).toUpperCase() + nivel.slice(1)}\n\n`;
    message += `📊 *Asistencia por Clase (Previo a Formación)*\n`;
    message += `\n➖➖➖➖➖➖➖➖➖➖\n`;

    for (const [grado, secciones] of Object.entries(reporte)) {
      const icon = gradoIconMap[grado] || "🔢"; // Icono por defecto si no se encuentra
      const color = gradoColorMap[grado] || "⚫"; // Color por defecto si no se encuentra

      // El objeto 'secciones' puede tener múltiples entradas, iteramos sobre ellas.
      for (const [seccion, datos] of Object.entries(secciones as object)) {
        const { asistencia, total } = datos as { asistencia: number; total: number };
        if (total > 0) {
          const percent = Math.round((asistencia / total) * 100);
          const bar = '█'.repeat(Math.round(percent / 10)) + '░'.repeat(10 - Math.round(percent / 10));
          // Números de dos dígitos para consistencia visual
          const asistenciaStr = String(asistencia).padStart(2, '0');
          const totalStr = String(total).padStart(2, '0');
          message += `${color} ${icon}${seccion} *${asistenciaStr}* / *${totalStr}* ${bar} ${percent}%\n`;
        }
      }
    }

    message += `\n⚠️ *Este es un reporte preliminar, no el consolidado final.*\n`;
    message += `✅ *Gracias por su gestión!*`;

    return message;
  }


  private async sendMessage(phoneNumber: string, message: string): Promise<void> {
    if (!this.page) {
      this.logger.error('❌ La página de WhatsApp no está inicializada. No se puede enviar el mensaje.');
      throw new Error('Página de WhatsApp no disponible.');
    }

    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const countryCode = this.configService.get<string>('WHATSAPP_COUNTRY_CODE', '51');
    if (!formattedPhone.startsWith(countryCode) && formattedPhone.length === 9) {
      formattedPhone = countryCode + formattedPhone;
    }

    // 🚫 **PROTECCIÓN: No enviar mensajes al número de prueba**
    const blockedNumbers = ['963828458', '51963828458'];
    const plainPhone = formattedPhone.replace(countryCode, '');

    if (blockedNumbers.includes(plainPhone) || blockedNumbers.includes(formattedPhone)) {
      this.logger.warn(`⚠ El número ${formattedPhone} está bloqueado (número de prueba). No se enviará el mensaje.`);
      throw new Error(`El número ${formattedPhone} está bloqueado y no recibe mensajes.`);
    }
    // ----------------------------------------------------------

    try {
      this.logger.log(`🚀 Enviando mensaje a ${formattedPhone}...`);

      const searchBox = await this.page.waitForSelector(this.SELECTORS.SEARCH_BOX, { timeout: 15000 });
      if (!searchBox) throw new Error('No se encontró el cuadro de búsqueda.');
      await searchBox.click({ clickCount: 3 });
      await this.page.keyboard.press('Backspace');
      await this.page.type(this.SELECTORS.SEARCH_BOX, formattedPhone, { delay: 100 });
      await this.page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 1500));

      const noWhatsAppFound = await this.page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('No se encontró el chat') || text.includes('Invitar a WhatsApp') || text.includes('No chat found') || text.includes('Invite to WhatsApp');
      });

      if (noWhatsAppFound) {
        this.logger.warn(`El número ${formattedPhone} no tiene WhatsApp. Limpiando búsqueda...`);
        const backButton = await this.page.$('button[aria-label="Atrás"], button[aria-label="Back"]');
        if (backButton) {
          await backButton.click();
        }
        throw new Error(`El número ${formattedPhone} no tiene WhatsApp.`);
      }

      const messageBox = await this.page.waitForSelector(this.SELECTORS.MESSAGE_BOX, { timeout: 5000 });

      if (!messageBox) throw new Error('No se encontró el cuadro de mensaje.');
      await messageBox.click();
      await new Promise(resolve => setTimeout(resolve, 200));

      const lines = message.split('\n');
      for (let i = 0; i < lines.length; i++) {
        await this.page.keyboard.type(lines[i], { delay: 10 });
        if (i < lines.length - 1) {
          await this.page.keyboard.down('Shift');
          await this.page.keyboard.press('Enter');
          await this.page.keyboard.up('Shift');
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

      const randomDelay = Math.random() * 2000 + 1000;
      await new Promise(resolve => setTimeout(resolve, randomDelay));
      await this.page.keyboard.press('Enter');

      this.logger.log(`✅ Mensaje enviado a ${formattedPhone} con éxito.`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (this.page) {
        const metrics = await this.page.metrics();
        this.logger.log(`📊 Uso de memoria (JS Heap): ${((metrics.JSHeapTotalSize ?? 0) / 1024 / 1024).toFixed(2)} MB`);
      }

    } catch (error) {
      let errorMessage = 'Error desconocido';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      this.logger.error(`❌ Error al enviar mensaje a ${formattedPhone}: ${errorMessage}`);
      throw new Error(`Fallo al enviar mensaje a ${formattedPhone}: ${errorMessage}`);
    }
  }




  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return; // Ya hay un proceso en ejecución
    }

    if (this.messageQueue.length === 0) {
      return; // La cola está vacía
    }

    this.isProcessingQueue = true;
    this.logger.log(`🏃‍♂️ Iniciando procesamiento de cola. Mensajes pendientes: ${this.messageQueue.length}`);

    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift(); // Tomar el primer elemento de la cola
      if (item) {
        try {
          this.logger.log(`📨 Procesando mensaje para ${item.phoneNumber}...`);
          await this.sendMessage(item.phoneNumber, item.message);
        } catch (error) {
          this.logger.error(`❌ Falló el envío del mensaje encolado para ${item.phoneNumber}. Error: ${error instanceof Error ? error.message : 'Desconocido'}`);
          // El error ya se loguea en sendMessage, pero lo logueamos aquí también para el contexto de la cola.
        }
      }
    }

    this.isProcessingQueue = false;
    this.logger.log('🏁 Procesamiento de cola finalizado.');
  }

  public async sendAssistanceReport(reportData: SendAssistanceDto): Promise<string> {
    // La validación de conexión se hace antes de encolar
    if (!this.isReady()) {
      throw new Error('El servicio de WhatsApp no está listo. No se puede encolar el mensaje.');
    }

    // --- INICIO: Lógica para sobreescribir número en modo de prueba ---
    const overridePhoneNumber = this.configService.get<string>('OVERRIDE_PHONE_NUMBER');
    const finalPhoneNumber = overridePhoneNumber || reportData.phoneNumber;
    if (overridePhoneNumber) {
      this.logger.warn(`📞 [PRUEBA] Se está sobreescribiendo el número de destino. Original: ${reportData.phoneNumber}, Nuevo: ${finalPhoneNumber}`);
    }
    // --- FIN: Lógica para sobreescribir número ---

    const message = this.generateAssistanceMessage(reportData);
    this.messageQueue.push({ phoneNumber: finalPhoneNumber, message });
    this.logger.log(`📥 Mensaje para ${reportData.student} añadido a la cola. Total en cola: ${this.messageQueue.length}`);


    // Dispara el procesador de la cola (no se espera a que termine)
    this.processQueue();

    return `Reporte para ${reportData.student} ha sido encolado.`;
  }

  public async sendClassAttendanceReport(body: any): Promise<string> {
    if (!this.isReady()) {
      throw new Error('El servicio de WhatsApp no está listo. No se puede encolar el mensaje.');
    }

    const { destinatario } = body;
    if (!destinatario || !destinatario.telefono) {
      throw new Error('El cuerpo de la petición no contiene un destinatario con teléfono.');
    }

    // --- INICIO: Lógica para sobreescribir número en modo de prueba ---
    const overridePhoneNumber = this.configService.get<string>('OVERRIDE_PHONE_NUMBER');
    const finalPhoneNumber = overridePhoneNumber || destinatario.telefono;
    if (overridePhoneNumber) {
      this.logger.warn(`📞 [PRUEBA] Se está sobreescribiendo el número de destino. Original: ${destinatario.telefono}, Nuevo: ${finalPhoneNumber}`);
    }
    // --- FIN: Lógica para sobreescribir número ---

    const message = this.generateClassAttendanceReportMessage(body);
    this.messageQueue.push({ phoneNumber: finalPhoneNumber, message });
    this.logger.log(`📥 Reporte de asistencia de clase añadido a la cola. Total en cola: ${this.messageQueue.length}`);

    this.processQueue(); // Dispara el procesador sin esperar
    return `Reporte de asistencia de clase ha sido encolado para su envío.`;
  }

  public isReady(): boolean {
    return !!this.page && !!this.browser?.isConnected();
  }
}
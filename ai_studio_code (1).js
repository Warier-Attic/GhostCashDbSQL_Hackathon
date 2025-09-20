--- START OF FILE indexjs-api.js ---

// Tutorial del cliente de Open Payments
// Este archivo se ejecuta en el servidor. Los archivos HTML le envían solicitudes para ejecutar estas acciones.

// Objetivo: Realizar un pago entre pares entre dos direcciones de billetera.

import { createAuthenticatedClient, isFinalizedGrant } from "@interledger/open-payments";
import fs from "fs";
import Readline from "readline/promises";

// --- FUNCIÓN PRINCIPAL DE PAGO ---
// Esta función sería llamada por el frontend (p. ej., al hacer clic en "Enviar" en index.html o "Depositar" en ahorro.html)
async function realizarPago(urlCliente, keyIdCliente, urlRemitente, urlReceptor, monto) {
    console.log("Iniciando proceso de pago...");

    // a. Cargar la clave privada y configurar el cliente
    const privateKey = fs.readFileSync("private.key", "utf8");
    const client = await createAuthenticatedClient({
        walletAddressUrl: urlCliente,
        privateKey: privateKey,
        keyId: keyIdCliente,
    });
    console.log("Cliente autenticado creado.");

    // b. Obtener las direcciones de las billeteras
    const sendingWalletAddress = await client.walletAddress.get({ url: urlRemitente });
    const receivingWalletAddress = await client.walletAddress.get({ url: urlReceptor });
    console.log("Billeteras de remitente y receptor obtenidas.");

    // 1. Obtener una concesión para un pago entrante (para el receptor)
    const incomingPaymentGrant = await client.grant.request(
        { url: receivingWalletAddress.authServer },
        {
            access_token: {
                access: [{
                    type: "incoming-payment",
                    actions: ["create", "read", "list"],
                }]
            }
        }
    );
    if (!isFinalizedGrant(incomingPaymentGrant)) {
        throw new Error("EL pago entrante no se ha concedido correctamente");
    }
    console.log("Concesión de pago entrante obtenida.");

    // 2. Crear un pago entrante para el receptor
    const incomingPayment = await client.incomingPayment.create(
        {
            url: receivingWalletAddress.resourceServer,
            accessToken: incomingPaymentGrant.access_token.value,
        },
        {
            walletAddress: receivingWalletAddress.id,
            incomingAmount: {
                assetCode: receivingWalletAddress.assetCode,
                assetScale: receivingWalletAddress.assetScale,
                value: monto,
            },
        }
    );
    console.log("Pago entrante creado:", incomingPayment.id);

    // 3. Obtener una concesión para una cotización (para el remitente)
    const quoteGrant = await client.grant.request(
        { url: sendingWalletAddress.authServer },
        {
            access_token: {
                access: [{
                    type: "quote",
                    actions: ["create"],
                }]
            }
        }
    );
    if (!isFinalizedGrant(quoteGrant)) {
        throw new Error("La concesión de cotización falló");
    }
    console.log("Concesión de cotización obtenida.");

    // 4. Obtener una cotización para el remitente
    const quote = await client.quote.create(
        {
            url: sendingWalletAddress.resourceServer, // Corregido: La cotización se crea en el servidor del remitente
            accessToken: quoteGrant.access_token.value,
        },
        {
            walletAddress: sendingWalletAddress.id,
            receiver: incomingPayment.id,
            method: "ilp"
        }
    );
    console.log("Cotización creada:", quote.id);

    // 5. Obtener una concesión para un pago saliente
    const outgoingPaymentGrant = await client.grant.request(
        { url: sendingWalletAddress.authServer },
        {
            access_token: {
                access: [{
                    type: "outgoing-payment",
                    actions: ["create"],
                    limits: {
                        debitAmount: quote.debitAmount,
                    },
                    identifier: sendingWalletAddress.id,
                }]
            },
            interact: {
                start: ["redirect"],
            },
        }
    );
    console.log("Concesión de pago saliente obtenida. Esperando interacción del usuario.");

    // 6. Simular la interacción del usuario
    await Readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    }).question("Presione enter para simular la confirmación del usuario y continuar");

    // 7. Finalizar la concesión del pago saliente
    const finalizedOutgoingPaymentGrant = await client.grant.continue({
        url: outgoingPaymentGrant.continue.uri,
        accessToken: outgoingPaymentGrant.continue.access_token.value,
    });
    if (!isFinalizedGrant(finalizedOutgoingPaymentGrant)) {
        throw new Error("Se espera la finalización de la concesión");
    }
    console.log("Concesión de pago saliente finalizada.");

    // 8. Crear el pago saliente
    const outgoingPayment = await client.outgoingPayment.create(
        {
            url: sendingWalletAddress.resourceServer,
            accessToken: finalizedOutgoingPaymentGrant.access_token.value,
        },
        {
            walletAddress: sendingWalletAddress.id,
            quoteId: quote.id,
        }
    );
    console.log("¡Pago Saliente Creado Exitosamente!", outgoingPayment.id);
    return outgoingPayment;
}

// --- FUNCIÓN PARA CREAR SOLICITUDES DE PAGO ---
// Llamada por el frontend (p. ej., "Recibir" en index.html o "Dividir cuenta" en escaneo.html)
export async function crearSolicitudDePago(urlCliente, keyIdCliente, urlReceptor, monto) {
    // Similar a los primeros pasos de realizarPago, pero solo para el receptor
    console.log("Creando solicitud de pago...");
    const privateKey = fs.readFileSync("private.key", "utf8");
    const client = await createAuthenticatedClient({
        walletAddressUrl: urlCliente,
        privateKey: privateKey,
        keyId: keyIdCliente,
    });
    const receivingWalletAddress = await client.walletAddress.get({ url: urlReceptor });

    const incomingPaymentGrant = await client.grant.request(/*...*/);
    const incomingPayment = await client.incomingPayment.create(/*...*/);

    console.log(`Solicitud de pago creada. Comparte esta URL: ${incomingPayment.id}`);
    return incomingPayment.id; // Esta URL es la que se comparte o se convierte en QR
}

// Ejemplo de cómo se podría ejecutar (esto sería llamado por un endpoint de API)
// (async () => {
//     try {
//         await realizarPago(
//             "URL_CLIENTE_WALLET",
//             "KEY_ID_CLIENTE",
//             "URL_REMITENTE_WALLET",
//             "URL_RECEPTOR_WALLET",
//             "1000" // Monto
//         );
//     } catch (error) {
//         console.error("Error en el flujo de pago:", error.message);
//     }
// })();
--- END OF FILE indexjs-api.js ---
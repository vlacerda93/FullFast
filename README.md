# 🚀 Plataforma de Deploy e Automação de Infraestrutura — Terabits

> **Do código ao ar em minutos.** Uma plataforma *self-service* (estilo Vercel/Render) desenvolvida sob medida para pequenas e médias empresas, eliminando intervenções manuais via SSH e reduzindo custos operacionais com tecnologias *open-source*[cite: 1, 2, 14].

![Status](https://img.shields.io/badge/Status-MVP%20em%20Desenvolvimento-blue)
![Prazo](https://img.shields.io/badge/Escopo-MVP%205%20Semanas-green)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions%20%2B%20GHCR-2088FF?logo=github-actions&logoColor=white)

---

## 📋 Sobre o Projeto

Desenvolvido como Projeto Integrador na etapa final da formação DevOps, este repositório contém a especificação e implementação do MVP da **Plataforma de Deploy Terabits**[cite: 14]. 

O objetivo central é substituir processos manuais e fragmentados de publicação por um ciclo automatizado e seguro, permitindo que desenvolvedores publiquem, monitorem e realizem *rollbacks* de aplicações diretamente por uma interface web, sem necessidade de acesso direto ao servidor[cite: 2, 3, 14].

### 🎯 Cenário Atual vs. Solução Proposta

| Dimensão | Cenário Anterior | Com a Plataforma Terabits |
| :--- | :--- | :--- |
| **Acesso ao Servidor** | Manual via SSH (restrito a perfis técnicos)[cite: 2, 3, 14] | Interface Web intuitiva (zero acesso direto à VPS)[cite: 3, 14] |
| **Fluxo de Deploy** | Manual e propenso a erro humano[cite: 2, 3] | Pipeline automatizada (Testes → Build → Registry → Deploy)[cite: 3, 14] |
| **Rollback** | Complexo, exigindo recriação manual do ambiente[cite: 3, 14] | **Rollback em 1 clique** usando tags versionadas no GHCR[cite: 7, 16, 18] |
| **Segredos / `.env`** | Variáveis gerenciadas manualmente[cite: 3, 14] | Gestão centralizada com **criptografia AES-256-GCM**[cite: 9, 15] |
| **Infraestrutura** | Custo alto ou dependência local[cite: 2, 4] | **Custo Zero no MVP** via VPS Linux simulada em Docker[cite: 4, 15] |

---

## 🏗️ Arquitetura e Fluxo do Motor de Deploy

Para garantir eficiência máxima e custo zero de nuvem durante o desenvolvimento do MVP, a arquitetura delega o processamento pesado de *build* e testes para o **GitHub Actions** e simula um ambiente de produção real utilizando um container Linux com **OpenSSH + Docker** rodando localmente[cite: 4, 15, 17, 18].

```mermaid
graph LR
    A[Frontend Web<br>Next.js] -->|1. Dispara Deploy| B[API Backend<br>NestJS / Spring]
    B -->|2. Criptografa .env<br>& Aloca Porta| C[(Banco Relacional)]
    B -->|3. workflow_dispatch| D[GitHub Actions]
    D -->|4. Testes & Build| E[GHCR<br>Container Registry]
    B -->|5. Polling / Webhook| D
    B -->|6. SFTP .env chmod 600<br>& Comandos SSH| F[VPS Simulada<br>Docker + OpenSSH]
    E -->|7. docker pull| F
    F -->|8. App Online| G((localhost:Porta))

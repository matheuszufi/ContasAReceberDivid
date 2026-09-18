import React, { useState } from 'react'
import Layout from '../components/Layout'
import './SimuladorVendas.css'

const simulacaoInicial = {
  modo: 'cobranca',
  valor: '',
  liquidoDesejado: '',
  meses: '',
  juros: '2.99',
  taxaAntecipacao: '1.7',
  taxa: '0.49',
  repassarTaxasCartao: false,
}

const DIAS_ENTRE_PARCELAS = 32
const AJUSTE_DIAS = 0.5

const formatarMoeda = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const formatarPercentual = value => Number(value || 0).toFixed(2).replace('.', ',')

function calcularFatorAntecipacao(taxaMensal, meses) {
  if (meses <= 0) return 0
  const diasMedios = DIAS_ENTRE_PARCELAS * ((meses + 1) / 2) + AJUSTE_DIAS
  const fator = (Number(taxaMensal) / 100) * (diasMedios / 30)
  return Math.min(Math.max(fator, 0), 0.999999)
}

export default function SimuladorVendas() {
  const [simulacao, setSimulacao] = useState(simulacaoInicial)

  const handleSimulacaoChange = event => {
    const { name, value } = event.target
    setSimulacao(prev => ({ ...prev, [name]: value }))
  }

  const quantidadeMeses = Math.max(0, Math.floor(Number(simulacao.meses) || 0))
  const taxaCartao = Number(simulacao.juros) || 0
  const taxaAntecipacaoMensal = Number(simulacao.taxaAntecipacao) || 0
  const taxaFixa = Number(simulacao.taxa) || 0
  const fatorCartao = 1 - taxaCartao / 100
  const fatorAntecipacao = calcularFatorAntecipacao(taxaAntecipacaoMensal, quantidadeMeses)

  let valorBase = 0
  let totalSemAntecipacao = 0
  let totalComAntecipacao = 0

  if (simulacao.modo === 'liquido') {
    totalComAntecipacao = Math.max(0, Number(simulacao.liquidoDesejado) || 0)
    totalSemAntecipacao = fatorAntecipacao < 1
      ? totalComAntecipacao / (1 - fatorAntecipacao)
      : 0
    valorBase = totalSemAntecipacao > 0 && fatorCartao > 0
      ? (totalSemAntecipacao + taxaFixa) / fatorCartao
      : 0
  } else {
    const valorInformado = Math.max(0, Number(simulacao.valor) || 0)
    valorBase = simulacao.repassarTaxasCartao && fatorCartao > 0
      ? (valorInformado + taxaFixa) / fatorCartao
      : valorInformado
    totalSemAntecipacao = simulacao.repassarTaxasCartao
      ? valorInformado
      : Math.max(0, valorBase * fatorCartao - taxaFixa)
    totalComAntecipacao = totalSemAntecipacao * (1 - fatorAntecipacao)
  }

  const parcelaCliente = quantidadeMeses > 0 ? valorBase / quantidadeMeses : 0
  const parcelaSemAntecipacao = quantidadeMeses > 0 ? totalSemAntecipacao / quantidadeMeses : 0
  const custoAntecipacao = totalSemAntecipacao - totalComAntecipacao

  return (
    <Layout title="Simulador Asaas" subtitle="Calcule vendas parceladas no cartão">
      <section className="simulador-vendas">
        <div className="simulador-vendas-header">
          <div>
            <h2>Simulador Asaas</h2>
            <p>Simule cobranças parceladas e o valor líquido recebido com antecipação.</p>
          </div>
          <span className="simulador-vendas-badge">Cartão de crédito</span>
        </div>

        <div className="simulador-vendas-content">
          <div className="simulador-vendas-form">
            <div className="simulador-modo-switch" aria-label="Modo de cálculo">
              <button type="button" className={simulacao.modo === 'cobranca' ? 'is-active' : ''} onClick={() => setSimulacao(prev => ({ ...prev, modo: 'cobranca' }))}>Sei quanto vou cobrar</button>
              <button type="button" className={simulacao.modo === 'liquido' ? 'is-active' : ''} onClick={() => setSimulacao(prev => ({ ...prev, modo: 'liquido' }))}>Sei quanto quero receber com a antecipação</button>
            </div>

            <div className="simulador-vendas-fields">
              {simulacao.modo === 'cobranca' && (
                <label>{simulacao.repassarTaxasCartao ? 'Valor a receber (antes da antecipação)' : 'Total a cobrar'}<input name="valor" type="number" min="0" step="0.01" value={simulacao.valor} onChange={handleSimulacaoChange} placeholder="0,00" /></label>
              )}
              <label>Número de parcelas<input name="meses" type="number" min="1" step="1" value={simulacao.meses} onChange={handleSimulacaoChange} placeholder="Ex.: 12" /></label>
              <label>Taxa do cartão (%)<input name="juros" type="number" min="0" step="0.01" value={simulacao.juros} onChange={handleSimulacaoChange} /></label>
              <label>Taxa fixa por cobrança (R$)<input name="taxa" type="number" min="0" step="0.01" value={simulacao.taxa} onChange={handleSimulacaoChange} /></label>
              <label>Taxa de antecipação (% ao mês)<input name="taxaAntecipacao" type="number" min="0" step="0.01" value={simulacao.taxaAntecipacao} onChange={handleSimulacaoChange} /></label>
            </div>
            <label className="simulador-fee-toggle">
              <input
                type="checkbox"
                checked={simulacao.repassarTaxasCartao}
                onChange={event => setSimulacao(prev => ({ ...prev, repassarTaxasCartao: event.target.checked }))}
              />
              <span>
                <strong>Repassar taxas do cartão</strong>
                <small>Acrescenta a taxa percentual e fixa ao valor pago por quem será cobrado.</small>
              </span>
            </label>
            <button type="button" className="simulador-reset" onClick={() => setSimulacao(simulacaoInicial)}>Nova simulação</button>
          </div>

          <div className="simulador-vendas-result">
            <h3>Resultado da simulação</h3>
            <div className="simulador-result-featured"><span>{simulacao.modo === 'liquido' ? 'A cobrança deverá ser' : simulacao.repassarTaxasCartao ? 'Total cobrado do cliente' : 'Se a cobrança for'}</span><i>{formatarMoeda(valorBase)}</i></div>
            <p>{quantidadeMeses} parcelas de {formatarMoeda(parcelaCliente)}</p>
            {simulacao.repassarTaxasCartao && valorBase > 0 && (
              <p>Valor da cobrança {formatarMoeda(totalSemAntecipacao)} + {formatarMoeda(valorBase - totalSemAntecipacao)} de taxas do cartão repassadas.</p>
            )}
            <div className="simulador-result-row"><span>Você recebe sem antecipação</span><strong>{formatarMoeda(totalSemAntecipacao)}</strong></div>
            <p>{quantidadeMeses} parcelas de {formatarMoeda(parcelaSemAntecipacao)} a cada {DIAS_ENTRE_PARCELAS} dias.</p>
            {simulacao.modo === 'liquido' ? (
              <label className="simulador-result-row simulador-result-input"><span>Você recebe com antecipação</span><input name="liquidoDesejado" type="number" min="0" step="0.01" value={simulacao.liquidoDesejado} onChange={handleSimulacaoChange} placeholder="0,00" /></label>
            ) : (
              <div className="simulador-result-row"><span>Você recebe com antecipação</span><strong>{formatarMoeda(totalComAntecipacao)}</strong></div>
            )}
            <p>Taxas: cartão {formatarPercentual(taxaCartao)}%, antecipação {formatarPercentual(taxaAntecipacaoMensal)}% ao mês e {formatarMoeda(taxaFixa)} fixos. Custo da antecipação: {formatarMoeda(custoAntecipacao)}.</p>
          </div>
        </div>
      </section>
    </Layout>
  )
}

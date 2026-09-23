from dataclasses import dataclass, replace

import cv2
import numpy as np

from app.pipeline.config import PipelineConfig


@dataclass(frozen=True, slots=True)
class BubbleAnswer:
    question_number: int
    detected_answer: str | None
    classification: str
    confidence: float
    fill_percentages: dict[str, float]
    crop: tuple[int, int, int, int]


def _classify_fills(fills: dict[str, float], config: PipelineConfig) -> tuple[str, str | None, float]:
    ranked = sorted(fills.items(), key=lambda item: item[1], reverse=True)
    first, second = ranked[0], ranked[1]
    if first[1] < config.bubble_blank_threshold:
        return "blank", None, min(1.0, 1.0 - first[1])
    if first[1] >= config.bubble_mark_threshold and second[1] >= config.bubble_mark_threshold and first[1] - second[1] <= config.double_mark_margin:
        return "multiple", None, 0.0
    if first[1] - second[1] < config.dominance_margin:
        return "low_confidence", first[0], max(0.0, first[1] - second[1])
    confidence = min(1.0, (first[1] - second[1]) / max(config.dominance_margin, 0.01))
    return ("answered" if confidence >= config.min_confidence else "low_confidence"), first[0], confidence


def _bubble_fill(
    gray: np.ndarray,
    center_x: int,
    center_y: int,
    radius: int,
    config: PipelineConfig,
    hsv: np.ndarray | None = None,
) -> float:
    if center_x - radius < 0 or center_y - radius < 0 or center_x + radius > gray.shape[1] or center_y + radius > gray.shape[0]:
        return 0.0
    roi = gray[center_y - radius:center_y + radius, center_x - radius:center_x + radius]
    mask = np.zeros(roi.shape, dtype=np.uint8)
    cv2.circle(mask, (radius, radius), max(1, radius - 4), 255, -1)
    local_radius = radius * 2
    local = gray[max(0, center_y - local_radius):min(gray.shape[0], center_y + local_radius), max(0, center_x - local_radius):min(gray.shape[1], center_x + local_radius)]
    paper_level = max(1.0, float(np.percentile(local, 85)))
    dark_pixels = np.where(roi < paper_level * config.bubble_darkness_ratio, 255, 0).astype(np.uint8)
    ink_pixels = dark_pixels
    if hsv is not None:
        color_roi = hsv[center_y - radius:center_y + radius, center_x - radius:center_x + radius]
        # Caneta azul tem saturação alta; o traço preto/cinza impresso das
        # bolhas tem saturação baixa. Isso recupera marcações coloridas sem
        # reduzir o limiar do papel inteiro.
        colored_pixels = np.where(
            (color_roi[:, :, 1] >= 65) & (color_roi[:, :, 2] <= 225), 255, 0
        ).astype(np.uint8)
        ink_pixels = cv2.bitwise_or(dark_pixels, colored_pixels)
    return round(float(cv2.countNonZero(cv2.bitwise_and(ink_pixels, mask))) / max(1, cv2.countNonZero(mask)), 4)


def read_bubbles(image: np.ndarray, total_questions: int, alternatives_count: int, config: PipelineConfig, subject_blocks: list[dict] | None = None) -> list[BubbleAnswer]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    options = tuple("ABCDE"[:alternatives_count])
    columns = 2 if total_questions > 25 else 1
    per_column = int(np.ceil(total_questions / columns))
    scale = config.px_per_mm
    radius = int(config.bubble_radius_mm * scale)
    answers: list[BubbleAnswer] = []
    subject_layout = config.layout_version == "corrige-plus-v2-subject-blocks" and bool(subject_blocks)
    block_starts = {int(block["start_question_number"]) for block in subject_blocks or []}
    current_y = [config.question_start_y_mm for _ in range(columns)]
    for question in range(1, total_questions + 1):
        column = (question - 1) // per_column
        position = (question - 1) % per_column
        if subject_layout and (question in block_starts or position == 0):
            # O gerador do PDF reserva 10 mm entre o título da matéria e a
            # primeira bolha do bloco. A leitura deve usar a mesma geometria.
            current_y[column] += 10
        center_y = int((current_y[column] if subject_layout else config.question_start_y_mm + position * config.question_spacing_y_mm) * scale)
        fills: dict[str, float] = {}
        for index, option in enumerate(options):
            center_x = int((config.first_bubble_x_mm + column * config.column_spacing_mm + index * config.bubble_spacing_x_mm) * scale)
            # Uma tentativa de rotação pode não comportar a grade inteira. Em
            # vez de deixar um recorte vazio causar uma exceção do OpenCV,
            # tratamos aquela alternativa como indisponível nesta orientação.
            if (
                center_x - radius < 0
                or center_y - radius < 0
                or center_x + radius > gray.shape[1]
                or center_y + radius > gray.shape[0]
            ):
                fills[option] = 0.0
                continue
            roi = gray[center_y - radius:center_y + radius, center_x - radius:center_x + radius]
            mask = np.zeros(roi.shape, dtype=np.uint8)
            cv2.circle(mask, (radius, radius), max(1, radius - 4), 255, -1)
            local_radius = radius * 2
            local = gray[
                max(0, center_y - local_radius) : min(gray.shape[0], center_y + local_radius),
                max(0, center_x - local_radius) : min(gray.shape[1], center_x + local_radius),
            ]
            paper_level = max(1.0, float(np.percentile(local, 85)))
            dark_pixels = np.where(roi < paper_level * config.bubble_darkness_ratio, 255, 0).astype(np.uint8)
            fills[option] = round(
                float(cv2.countNonZero(cv2.bitwise_and(dark_pixels, mask)))
                / max(1, cv2.countNonZero(mask)),
                4,
            )
        ranked = sorted(fills.items(), key=lambda item: item[1], reverse=True)
        first, second = ranked[0], ranked[1]
        if first[1] < config.bubble_blank_threshold:
            classification, detected, confidence = "blank", None, min(1.0, 1.0 - first[1])
        elif first[1] >= config.bubble_mark_threshold and second[1] >= config.bubble_mark_threshold and first[1] - second[1] <= config.double_mark_margin:
            classification, detected, confidence = "multiple", None, 0.0
        elif first[1] - second[1] < config.dominance_margin:
            classification, detected, confidence = "low_confidence", first[0], max(0.0, first[1] - second[1])
        else:
            confidence = min(1.0, (first[1] - second[1]) / max(config.dominance_margin, 0.01))
            classification, detected = ("answered" if confidence >= config.min_confidence else "low_confidence"), first[0]
        x1 = int((config.first_bubble_x_mm + column * config.column_spacing_mm - 6) * scale)
        x2 = int((config.first_bubble_x_mm + column * config.column_spacing_mm + alternatives_count * config.bubble_spacing_x_mm) * scale)
        answers.append(BubbleAnswer(question, detected, classification, round(confidence, 4), fills, (x1, center_y - radius - 8, x2, center_y + radius + 8)))
        if subject_layout:
            current_y[column] += config.question_spacing_y_mm
    return answers


def _read_subject_blocks_with_local_alignment(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict],
) -> list[BubbleAnswer]:
    """Lê cartões v2 já impressos compensando pequenos desvios de câmera/papel.

    O leitor procura a melhor posição em uma janela curta por linha. Assim, a
    escolha continua sendo baseada somente na área circular de cada alternativa
    e um cartão sem marcações permanece em branco.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    options = tuple("ABCDE"[:alternatives_count])
    columns = 2 if total_questions > 25 else 1
    per_column = int(np.ceil(total_questions / columns))
    scale = config.px_per_mm
    radius = int(config.bubble_radius_mm * scale)
    block_starts = {int(block["start_question_number"]) for block in subject_blocks}
    current_y = [config.question_start_y_mm for _ in range(columns)]
    answers: list[BubbleAnswer] = []
    # Fotos de celular podem introduzir uma deformação residual mesmo depois
    # da normalização pelos quatro marcadores. A janela ainda é menor que a
    # distância vertical entre linhas (cerca de 72 px), portanto não alcança
    # a bolha da questão seguinte.
    offsets = (-45, -30, -15, 0, 15, 30, 45)
    for question in range(1, total_questions + 1):
        column = (question - 1) // per_column
        position = (question - 1) % per_column
        if question in block_starts or position == 0:
            current_y[column] += 10
        base_y = int(current_y[column] * scale)
        base_x = int((config.first_bubble_x_mm + column * config.column_spacing_mm) * scale)
        best_fills: dict[str, float] | None = None
        best_offset = (0, 0)
        best_score = -1.0
        for offset_y in offsets:
            for offset_x in offsets:
                fills = {
                    option: _bubble_fill(
                        gray,
                        base_x + index * int(config.bubble_spacing_x_mm * scale) + offset_x,
                        base_y + offset_y,
                        radius,
                        config,
                        hsv,
                    )
                    for index, option in enumerate(options)
                }
                ranked = sorted(fills.values(), reverse=True)
                # Prefere uma marca forte e isolada; em branco, os contornos
                # das alternativas ficam abaixo do limiar de marcação.
                score = ranked[0] - (ranked[1] * 0.25)
                if score > best_score:
                    best_score, best_fills, best_offset = score, fills, (offset_x, offset_y)
        assert best_fills is not None
        classification, detected, confidence = _classify_fills(best_fills, config)
        x1 = base_x - 6 * int(scale) + best_offset[0]
        x2 = base_x + alternatives_count * int(config.bubble_spacing_x_mm * scale) + best_offset[0]
        answers.append(BubbleAnswer(question, detected, classification, round(confidence, 4), best_fills, (x1, base_y + best_offset[1] - radius - 8, x2, base_y + best_offset[1] + radius + 8)))
        current_y[column] += config.question_spacing_y_mm
    return answers


def _read_subject_blocks_with_block_alignment(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict],
) -> list[BubbleAnswer]:
    """Alinha cada bloco como uma grade única, sem misturar linhas vizinhas.

    A correção de perspectiva pelos marcadores reduz a maior parte da
    deformação, mas fotos inclinadas ainda podem deixar cada bloco alguns
    pixels fora da grade nominal. Diferentemente da busca independente por
    questão, este leitor usa o mesmo deslocamento e espaçamento para as dez
    linhas do bloco. Assim, uma marca da questão seguinte não pode ser usada
    para preencher a questão anterior.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    options = tuple("ABCDE"[:alternatives_count])
    columns = 2 if total_questions > 25 else 1
    per_column = int(np.ceil(total_questions / columns))
    scale = config.px_per_mm
    radius = int(config.bubble_radius_mm * scale)
    spacing_y = config.question_spacing_y_mm * scale
    bubble_spacing_x = config.bubble_spacing_x_mm * scale
    answers: list[BubbleAnswer] = []

    for block in subject_blocks:
        start = int(block["start_question_number"])
        end = int(block["end_question_number"])
        count = end - start + 1
        column = (start - 1) // per_column
        position = (start - 1) % per_column
        # Reproduz o avanço da grade nominal até a primeira questão do bloco.
        base_y = (config.question_start_y_mm + position * config.question_spacing_y_mm + 10) * scale
        if position:
            # Ao iniciar o segundo bloco da coluna, a grade já contém as dez
            # linhas do primeiro bloco e recebe mais 10 mm para o cabeçalho.
            base_y += 10 * scale
        base_x = (config.first_bubble_x_mm + column * config.column_spacing_mm) * scale

        best: tuple[float, float, float, list[dict[str, float]]] | None = None
        # O deslocamento vertical máximo fica abaixo da distância entre linhas.
        # A variação de escala cobre a deformação residual sem permitir que a
        # linha 1 seja confundida com a linha 2.
        for offset_x in range(-45, 46, 15):
            for offset_y in range(-35, 36, 10):
                for spacing_factor in (0.94, 0.97, 1.0, 1.03, 1.06):
                    rows: list[dict[str, float]] = []
                    score = 0.0
                    for row in range(count):
                        center_y = int(round(base_y + offset_y + row * spacing_y * spacing_factor))
                        fills = {
                            option: _bubble_fill(
                                gray,
                                int(round(base_x + offset_x + index * bubble_spacing_x)),
                                center_y,
                                radius,
                                config,
                                hsv,
                            )
                            for index, option in enumerate(options)
                        }
                        ranked = sorted(fills.values(), reverse=True)
                        # Uma marca preenchida é forte e isolada; o contorno
                        # de uma bolha vazia não deve elevar o candidato.
                        score += ranked[0] - ranked[1] * 0.25
                        rows.append(fills)
                    if best is None or score > best[0]:
                        best = (score, offset_x, offset_y, rows)

        assert best is not None
        _, offset_x, offset_y, rows = best
        for row, fills in enumerate(rows):
            center_y = int(round(base_y + offset_y + row * spacing_y))
            classification, detected, confidence = _classify_fills(fills, config)
            question_number = start + row
            x1 = int(round(base_x + offset_x - 6 * scale))
            x2 = int(round(base_x + offset_x + alternatives_count * bubble_spacing_x))
            answers.append(
                BubbleAnswer(
                    question_number,
                    detected,
                    classification,
                    round(confidence, 4),
                    fills,
                    (x1, center_y - radius - 8, x2, center_y + radius + 8),
                )
            )
    return sorted(answers, key=lambda answer: answer.question_number)


def _read_subject_blocks_with_circle_alignment(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict],
) -> list[BubbleAnswer] | None:
    """Recalibra a grade pelos contornos das bolhas impressas.

    Alguns cartões impressos em versões anteriores chegam com a grade alguns
    milímetros diferente, ou são fotografados sobre outras folhas. Os quatro
    marcadores ainda corrigem a página, mas os círculos impressos oferecem uma
    referência mais próxima da marca que precisa ser lida. A transformação é
    ajustada por bloco (10 x 5 bolhas) e só é usada quando há círculos
    suficientes para comprová-la.
    """
    gray = cv2.medianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 5)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    options = tuple("ABCDE"[:alternatives_count])
    columns = 2 if total_questions > 25 else 1
    per_column = int(np.ceil(total_questions / columns))
    scale = config.px_per_mm
    radius = int(config.bubble_radius_mm * scale)
    spacing_x = config.bubble_spacing_x_mm * scale
    spacing_y = config.question_spacing_y_mm * scale
    answers: list[BubbleAnswer] = []

    for block in subject_blocks:
        start = int(block["start_question_number"])
        end = int(block["end_question_number"])
        count = end - start + 1
        column = (start - 1) // per_column
        position = (start - 1) % per_column
        base_x = (config.first_bubble_x_mm + column * config.column_spacing_mm) * scale
        base_y = (config.question_start_y_mm + position * config.question_spacing_y_mm + 10) * scale
        if position:
            base_y += 10 * scale

        expected = np.array(
            [
                (base_x + option_index * spacing_x, base_y + row * spacing_y)
                for row in range(count)
                for option_index in range(alternatives_count)
            ],
            dtype=np.float32,
        )
        x1 = max(0, int(base_x - 110))
        x2 = min(gray.shape[1], int(base_x + (alternatives_count - 1) * spacing_x + 110))
        y1 = max(0, int(base_y - 130))
        y2 = min(gray.shape[0], int(base_y + (count - 1) * spacing_y + 130))
        circles = cv2.HoughCircles(
            gray[y1:y2, x1:x2],
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=max(48, int(radius * 2.2)),
            param1=100,
            param2=17,
            minRadius=max(16, int(radius * 0.8)),
            maxRadius=int(radius * 1.8),
        )
        if circles is None:
            return None
        observed = np.round(circles[0, :, :2]).astype(np.float32)
        observed[:, 0] += x1
        observed[:, 1] += y1
        if len(observed) < 14:
            return None

        predicted = expected.copy()
        matrix: np.ndarray | None = None
        for _ in range(3):
            distances = np.linalg.norm(predicted[:, None, :] - observed[None, :, :], axis=2)
            matches = sorted(
                (float(distances[row, column]), row, column)
                for row in range(len(expected))
                for column in range(len(observed))
                if distances[row, column] <= 70
            )
            used_expected: set[int] = set()
            used_observed: set[int] = set()
            pairs: list[tuple[int, int]] = []
            for _, expected_index, observed_index in matches:
                if expected_index in used_expected or observed_index in used_observed:
                    continue
                used_expected.add(expected_index)
                used_observed.add(observed_index)
                pairs.append((expected_index, observed_index))
            if len(pairs) < 14:
                return None
            source = np.array([expected[index] for index, _ in pairs], dtype=np.float32)
            destination = np.array([observed[index] for _, index in pairs], dtype=np.float32)
            matrix, inliers = cv2.estimateAffine2D(source, destination, method=cv2.RANSAC, ransacReprojThreshold=12)
            if matrix is None or inliers is None or int(inliers.sum()) < 12:
                return None
            predicted = cv2.transform(expected.reshape(1, -1, 2), matrix).reshape(-1, 2)

        assert matrix is not None
        for row in range(count):
            fills: dict[str, float] = {}
            centers = predicted[row * alternatives_count:(row + 1) * alternatives_count]
            for option, center in zip(options, centers, strict=True):
                fills[option] = _bubble_fill(gray, int(round(center[0])), int(round(center[1])), radius, config, hsv)
            classification, detected, confidence = _classify_fills(fills, config)
            center_y = int(round(np.mean(centers[:, 1])))
            answers.append(
                BubbleAnswer(
                    start + row,
                    detected,
                    classification,
                    round(confidence, 4),
                    fills,
                    (int(centers[0, 0] - 6 * scale), center_y - radius - 8, int(centers[-1, 0] + radius + 8), center_y + radius + 8),
                )
            )
    return sorted(answers, key=lambda answer: answer.question_number)


def _read_subject_blocks_with_compact_legacy_layout(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict],
) -> list[BubbleAnswer]:
    """Compatibilidade para o primeiro PDF multidisciplinar distribuído.

    Esse modelo tinha blocos mais compactos que a versão atual: cerca de
    58 px entre linhas, com o segundo bloco iniciando mais abaixo. A detecção
    é sempre avaliada contra a grade atual e só vence quando há ganho claro de
    respostas; por isso não muda cartões emitidos no formato novo.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    options = tuple("ABCDE"[:alternatives_count])
    radius = int(config.bubble_radius_mm * config.px_per_mm)
    answers: list[BubbleAnswer] = []
    # Coordenadas medidas após normalização pelos quatro marcadores, a partir
    # dos círculos impressos dos cartões legados de quatro matérias.
    top_y, bottom_y = 1015.0, 1790.0
    left_x, right_x = 340.0, 1215.0
    spacing_x, spacing_y = 138.0, 58.0
    for block in subject_blocks:
        start = int(block["start_question_number"])
        end = int(block["end_question_number"])
        count = end - start + 1
        column = 0 if start <= 20 else 1
        base_x = left_x if column == 0 else right_x
        base_y = top_y if start in (1, 21) else bottom_y
        best: tuple[float, int, int, float, list[dict[str, float]]] | None = None
        for offset_x in range(-30, 31, 15):
            for offset_y in range(-15, 16, 5):
                for spacing_factor in (0.98, 1.0, 1.02):
                    rows: list[dict[str, float]] = []
                    score = 0.0
                    for row in range(count):
                        center_y = int(round(base_y + offset_y + row * spacing_y * spacing_factor))
                        fills = {
                            option: _bubble_fill(
                                gray,
                                int(round(base_x + offset_x + option_index * spacing_x)),
                                center_y,
                                radius,
                                config,
                                hsv,
                            )
                            for option_index, option in enumerate(options)
                        }
                        ranked = sorted(fills.values(), reverse=True)
                        score += ranked[0] - ranked[1] * 0.25
                        rows.append(fills)
                    if best is None or score > best[0]:
                        best = (score, offset_x, offset_y, spacing_factor, rows)
        assert best is not None
        _, offset_x, offset_y, spacing_factor, rows = best
        for row, fills in enumerate(rows):
            classification, detected, confidence = _classify_fills(fills, config)
            center_y = int(round(base_y + offset_y + row * spacing_y * spacing_factor))
            answers.append(
                BubbleAnswer(
                    start + row,
                    detected,
                    classification,
                    round(confidence, 4),
                    fills,
                    (
                        int(base_x + offset_x - 6 * config.px_per_mm),
                        center_y - radius - 8,
                        int(base_x + offset_x + alternatives_count * spacing_x),
                        center_y + radius + 8,
                    ),
                )
            )
    return sorted(answers, key=lambda answer: answer.question_number)


def _reading_score(answers: list[BubbleAnswer]) -> float:
    """Pontua uma leitura sem premiar uma folha efetivamente em branco."""
    score = 0.0
    for answer in answers:
        if answer.classification == "answered":
            score += 3.0 + answer.confidence
        elif answer.classification == "low_confidence":
            score += 1.0 + answer.confidence
        elif answer.classification == "multiple":
            score += 0.5
    return score


def read_bubbles_with_orientation_fallback(
    image: np.ndarray,
    total_questions: int,
    alternatives_count: int,
    config: PipelineConfig,
    subject_blocks: list[dict] | None = None,
) -> tuple[list[BubbleAnswer], int]:
    """Lê a grade em retrato e paisagem, escolhendo alternativa só se melhorar muito.

    A orientação informada pelo QR Code continua sendo a tentativa principal.
    As rotações extras evitam que uma foto deitada, ou um QR lido numa rotação
    incompleta, transforme uma folha preenchida em várias respostas em branco.
    """
    candidates: list[tuple[int, np.ndarray]] = [
        (0, image),
        (90, cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)),
        (180, cv2.rotate(image, cv2.ROTATE_180)),
        (270, cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)),
    ]
    readings = [
        (rotation, read_bubbles(candidate, total_questions, alternatives_count, config, subject_blocks))
        for rotation, candidate in candidates
    ]
    base_rotation, base_answers = readings[0]
    best_rotation, best_answers = max(readings, key=lambda item: _reading_score(item[1]))

    base_score = _reading_score(base_answers)
    best_score = _reading_score(best_answers)
    base_detected = sum(answer.detected_answer is not None for answer in base_answers)
    best_detected = sum(answer.detected_answer is not None for answer in best_answers)

    # Uma alternativa só substitui a orientação principal quando recupera pelo
    # menos duas marcações e oferece evidência substancialmente melhor. Isso
    # reduz falsos positivos em uma folha realmente deixada em branco.
    minimum_recovered_answers = max(3, int(np.ceil(total_questions * 0.5)))
    if (
        best_rotation
        and best_detected >= minimum_recovered_answers
        and best_detected >= base_detected + 2
        and best_score > max(1.0, base_score * 1.5)
    ):
        selected_answers, selected_rotation = best_answers, best_rotation
    else:
        selected_answers, selected_rotation = base_answers, base_rotation

    # Os primeiros PDFs multidisciplinares circularam com uma grade alguns
    # milímetros diferente da versão atual. Mantemos uma segunda geometria e
    # só a aceitamos se recuperar evidência de marcação de forma inequívoca.
    if config.layout_version == "corrige-plus-v2-subject-blocks" and subject_blocks:
        selected_image = next(candidate for rotation, candidate in candidates if rotation == selected_rotation)
        profiles = (
            config,
            replace(
                config,
                first_bubble_x_mm=35.0,
                column_spacing_mm=88.5,
                question_start_y_mm=97.0,
            ),
        )
        aligned = [
            _read_subject_blocks_with_local_alignment(
                selected_image,
                total_questions,
                alternatives_count,
                profile,
                subject_blocks,
            )
            for profile in profiles
        ]
        aligned_best = max(aligned, key=_reading_score)
        selected_score = _reading_score(selected_answers)
        selected_detected = sum(answer.detected_answer is not None for answer in selected_answers)
        aligned_detected = sum(answer.detected_answer is not None for answer in aligned_best)
        if (
            aligned_detected >= max(3, selected_detected + 3)
            and _reading_score(aligned_best) > max(4.0, selected_score * 1.35)
        ):
            selected_answers = aligned_best

        # Em uma folha quase toda preenchida, o layout compacto legado serve
        # como uma segunda evidência para as poucas linhas ainda em branco.
        # Não o executamos em cartões vazios/parciais e exigimos uma marca
        # muito forte; assim ele não cria respostas para um cartão em branco.
        selected_detected = sum(answer.detected_answer is not None for answer in selected_answers)
        if 35 <= selected_detected < 39:
            compact_answers = _read_subject_blocks_with_compact_legacy_layout(
                selected_image,
                total_questions,
                alternatives_count,
                config,
                subject_blocks,
            )
            merged = list(selected_answers)
            for index, (primary, fallback) in enumerate(zip(merged, compact_answers, strict=True)):
                strongest_fallback = max(fallback.fill_percentages.values())
                if (
                    primary.detected_answer is None
                    and fallback.detected_answer is not None
                    and fallback.classification == "answered"
                    and strongest_fallback >= 0.80
                ):
                    merged[index] = fallback
            if sum(answer.detected_answer is not None for answer in merged) > selected_detected:
                selected_answers = merged
    return selected_answers, selected_rotation

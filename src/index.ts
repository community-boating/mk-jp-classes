import * as fs from 'fs';
import csvParser from 'csv-parser'
import { Moment } from 'moment';
import moment from 'moment'
import { Either, right, left } from 'fp-ts/lib/Either';
import { none, Option, some } from 'fp-ts/lib/Option';
import * as _ from 'lodash';
import { printProc } from './proc';

const nowYear = moment().format("YYYY")

const WEEK_1_MONDAY = moment("06/12/2023 00:00", "MM/DD/YYYY HH:mm")

const SESSION_CT: {[K: number]: number} = {
	1221: 10,
	1481: 5,
	1482: 5,
	1266: 1,
	1281: 1,
	8: 5,
	22: 5,
	21: 5,
	1021: 5,
	281: 5,
	1241: 1,
	7: 1
}

export type Stagger = {
	datetime: Moment,
	amt: number
}

export type Session = {
	datetime: Moment,
	length: number
}

export type Instance = {
	typeId: number,
	typeName: string,
	sessions: Session[],
	staggers: Stagger[]
}

function parseCsv(): Promise<object[]> {
	return new Promise((resolve, reject) => {
		const input: object[] = [];

		fs.createReadStream("./data/classes.csv")
			.pipe(csvParser())
			.on("data", (data: object) => {
				input.push(data);
			})
			.on("end", () => {
				resolve(input)
			});
	})
}

function parseRow(row: any, i: number): Either<string, Instance> {
	const timeRegex = /^(\d{1,2}:\d{1,2})\s?-\s?(\d{1,2}:\d{1,2})$/
	const timeResult = timeRegex.exec(row["time"])
	if (!timeResult || !timeResult[1] || !timeResult[2]) return left(`(${i}) Bad Time: ${row["time"]}`);

	const staggerEithers = [
		[row["staggerDate1"], row["staggerTime1"], row["staggerAmt1"]],
		[row["staggerDate2"], row["staggerTime2"], row["staggerAmt2"]],
		[row["staggerDate3"], row["staggerTime3"], row["staggerAmt3"]]
	].map(ss => parseStagger(ss[0], ss[1], ss[2], false))
	.filter(o => o.isSome())
	.map(o => o.getOrElse(null as any));

	const badStaggers = staggerEithers.filter(e => e.isLeft())
	if (badStaggers.length > 0) {
		return left(badStaggers.map(e => e.swap().getOrElse("")).join("; "));
	}

	const typeId = Number(row["typeId"])
	const week = Number(row["week"]);
	const day = Number(row["day"]);
	const sessionCt = SESSION_CT[typeId];

	if (isNaN(typeId)) return left(`(${i}) Bad typeId: ${row["typeId"]}`);
	if (isNaN(week)) return left(`(${i}) Bad week: ${row["week"]}`);
	if (isNaN(day)) return left(`(${i}) Bad day: ${row["day"]}`);



	const weeksToAdd = week-1;
	const daysToAdd = day-2;

	const firstSessionDate = WEEK_1_MONDAY.clone().add(weeksToAdd*7 + daysToAdd, 'days')
	const nextSessionStart = moment(`${firstSessionDate.format("MM/DD/YYYY")} ${timeResult[1]}`, "MM/DD/YYYY HH:mm")
	const nextSessionEnd = moment(`${firstSessionDate.format("MM/DD/YYYY")} ${timeResult[2]}`, "MM/DD/YYYY HH:mm")
	const sessionLength = round(nextSessionEnd.diff(nextSessionStart, "minutes") / 60);

	const sessions: Session[] = [{
		datetime: nextSessionStart.clone(),
		length: sessionLength
	}].concat(_.range(0, sessionCt-1).map(i => ({
		datetime: addDay(nextSessionStart).clone(),
		length: sessionLength
	})))


	const ret: Instance = {
		typeId,
		typeName: row["typeName"],
		sessions,
		staggers: staggerEithers.map(e => e.getOrElse(null as any))
	};

	return right(ret)
}

function parseStagger(date: string, time: string, amt: string, debug: boolean): Option<Either<string, Stagger>> {
	if (debug) console.log([date, time, amt])
	return optionifyStringList([date, time, amt]).map(ss => {
		const datetime = getStaggerMoment(date, time)
		if (datetime.isLeft()) return left(datetime.swap().getOrElse(null as any))
		else return right({
			datetime: datetime.getOrElse(null as any),
			amt: Number(amt)
		})
	});
}

function optionifyStringList(ss: string[]): Option<string[]> {
	const badInputs = ss.filter(s => s == null || s.length == 0);
	if (badInputs.length > 0) return none;
	else return some(ss)
}

function getStaggerMoment(date: string, time: string): Either<string, Moment> {
	const dateRegex = /^(\d{1,2})\/(\d{1,2})(\/\d{2,4})?$/;
	const dateResult = dateRegex.exec(date);

	const timeRegex = /^(\d{1,2}):(\d{1,2})$/;
	const timeResult = timeRegex.exec(time);

	if (
		dateResult == null || dateResult[1] == null || dateResult[2] == null ||
		timeResult == null || timeResult[1] == null || timeResult[2] == null
	) return left(`bad stagger datetime: ${date} ${time}`)
	else {
		const dateString = (function() {
			var year = dateResult[3];
			if (year == null) {
				const month = dateResult[1];
				if (month == "11" || month == "12") {
					year = "/" + nowYear
				} else {
					year = "/" + String(Number(nowYear) + 1)
				}
			} else if (year.length == 3) {
				year = "/20" + year.substring(1)
			}
			return `${dateResult[1]}/${dateResult[2]}${year} ${timeResult[0]}`
		}());

		// console.log(dateString)

		const m = moment(dateString, "MM/DD/YYYY HH:mm");
		if (!m.isValid()) return left(`invalid moment: ${date} ${time}`)
		else return right(m)
	}
}

function printCount(n: number) {
	var ret = "";
	for (var i=0; i<n; i++) ret += "X";
	return ret;
}

function addDay(m: Moment) {
	const ret = m.add(1, 'day');
	// skip over weekends
	while (Number(ret.format("E")) > 5) ret.add(1, 'day')
	return ret;
}

function main() {
	parseCsv().then(rawInstances => {
		return Promise.resolve(rawInstances.map(parseRow))
	}).then(rowEithers => {
		const badRows = rowEithers.filter(e => e.isLeft())
		if (badRows.length > 0) {
			console.log(badRows.map(e => e.swap().getOrElse("")))
			process.exit(1)
		} else {
			const rows = rowEithers.map(e => e.getOrElse(null as any))
		//	rows.map(r => `${r.typeName} - ${printCount(r.staggers.length)}`).forEach(s => console.log(s))
			return Promise.resolve(rows)
		}
	}).then(instances => {
		printProc(instances)
	});
}

main();

// const now = moment();
// for (var i=0; i<7; i++) {
// 	console.log(now.format("MM/DD/YYYY"))
// 	console.log(now.format("E ddd"))
// 	console.log("-----------")
// 	now.add(1, 'day')
// }

function round(n: number) {
	return Math.round(n*100)/100
}
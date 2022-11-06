import { Instance } from ".";

export function printProc(instances: Instance[]) {
	const INDENT = "  ";
	const p = (indents: number, s: string) => {
		var ret = "";
		for (var i=0; i<indents; i++) ret += INDENT;
		ret += s;
		console.log(ret)
	}
	const br = () => { console.log("") }
	

	p(0, "declare")
	p(1, `l_instance_id number;`)
	p(0, "begin")
	instances.forEach(i => {
		p(1, `select jp_class_instances_seq.nextval into l_instance_id from dual;`)
		br();
		p(1, `insert into jp_class_instances (type_id, instance_id) values (${i.typeId}, l_instance_id);`);
		br();
		i.sessions.forEach(s => {
			const datetime = `to_date('${s.datetime.format("MM/DD/YYYY HH:mm")}','MM/DD/YYYY HH24:MI')`
			p(1, `insert into jp_class_sessions (instance_id, session_datetime, length_override) values (l_instance_id, ${datetime}, ${s.length});`)
			br();
		})
		i.staggers.forEach(s => {
			const datetime = `to_date('${s.datetime.format("MM/DD/YYYY HH:mm")}','MM/DD/YYYY HH24:MI')`
			p(1, `insert into jp_class_staggers (instance_id, stagger_date, occupancy) values (l_instance_id, ${datetime}, ${s.amt == -1 ? 100 : s.amt});`)
			br();
		})
		p(0, '------------------------------------------')
		br()
	})
	p(0, 'end;');
}